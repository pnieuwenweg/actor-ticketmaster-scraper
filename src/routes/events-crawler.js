import { Actor } from 'apify';
import { createCheerioRouter, log } from 'crawlee';
import { buildFetchRequest } from '../request-builder.js';
import { debugEventsHandler } from '../debug-handler.js';

export const eventsRouter = createCheerioRouter();

eventsRouter.addDefaultHandler(async (context) => {
    const state = await context.crawler.useState();

    const {
        maxItems,
        sortBy,
        countryCode,
        geoHash,
        distance,
        thisWeekendDate,
        dateFrom,
        dateTo,
        includeTBA,
        includeTBD,
        continuationMode,
        autoContinue,
        totalScrapedEvents,
        lastEventDate,
        hitApiLimit
    } = state;

    await handleEventsSearchPage(context, {
        maxItems,
        sortBy,
        countryCode,
        geoHash,
        distance,
        thisWeekendDate,
        dateFrom,
        dateTo,
        includeTBA,
        includeTBD,
        continuationMode,
        autoContinue,
        totalScrapedEvents,
        lastEventDate,
        hitApiLimit
    });
});

async function handleEventsSearchPage(context, {
    maxItems,
    sortBy,
    countryCode, geoHash, distance,
    thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD,
    continuationMode, autoContinue, totalScrapedEvents, lastEventDate, hitApiLimit
}) {
    const { request, json } = context;
    const { url, userData } = request;
    const { scrapedItems, classifications } = userData;

    // Get the current state to update it
    const state = await context.crawler.useState();

    // Add comprehensive debugging
    await debugEventsHandler(context);

    log.info(`Scraping url:
    ${request.url}`);

    if (!json || !json.data) {
        log.error('No data received in API response', { url: request.url, json });
        
        // Mark as hitting API limit and update state
        await context.crawler.useState({
            ...state,
            hitApiLimit: true,
            totalScrapedEvents: scrapedItems
        });
        return;
    }

    const { data: { products } } = json;

    if (!products) {
        log.error('No products found in API response', { 
            url: request.url, 
            data: json.data,
            errors: json.errors,
            page: userData.page + 1,
            totalScraped: scrapedItems
        });
        
        // Check if this might be a temporary API issue and if we should continue
        if (json.errors) {
            log.error('API returned errors:', json.errors);
        }
        
        // Ticketmaster appears to have API pagination limits
        // Log this as an API limitation rather than an error
        log.warning(`Ticketmaster API stopped returning results at page ${userData.page + 1}. This appears to be an API limitation.`);
        log.info(`Successfully scraped ${scrapedItems} events from ${userData.page + 1} pages before API limitation.`);
        
        // Mark as hitting API limit and update state
        const limitState = {
            ...state,
            hitApiLimit: true,
            totalScrapedEvents: scrapedItems
        };
        
        await context.crawler.useState(limitState);
        
        // Also save to Actor key-value store for persistence
        await Actor.setValue('CRAWLER_STATE', limitState);
        
        return;
    }

    const { page, items } = products;

    log.info(`API Response structure:`, {
        pageNumber: page.number,
        totalPages: page.totalPages,
        totalElements: page.totalElements,
        itemsReceived: items ? items.length : 0,
        url: request.url
    });

    if (!items || items.length === 0) {
        log.warning(`No items found on page ${page.number + 1}`, {
            pageInfo: page,
            url: request.url
        });
        
        // Check if we should continue to next page even with no items
        if (page.totalPages > userData.page + 1) {
            log.info('Continuing to next page despite no items on current page');
            const { crawler: { requestQueue } } = context;
            const nextRequest = buildFetchRequest({
                sortBy,
                countryCode,
                geoHash,
                distance,
                thisWeekendDate,
                dateFrom,
                dateTo,
                includeTBA,
                includeTBD,
            }, classifications, userData.page + 1, scrapedItems);

            log.info(`Enqueuing next search request for page: ${userData.page + 2} (after empty page)`);
            await requestQueue.addRequest(nextRequest);
        }
        return;
    }

    log.info(`Found ${items.length} events on page ${page.number + 1}`, { page: page.number });

    const events = getEventsFromResponse(items);
    const originalEventCount = events.length;
    
    // Debug: Check actual event dates to verify filtering is working
    if (events.length > 0) {
        const sampleDates = events.slice(0, 5).map(event => ({
            name: event.name,
            localDate: event.localDate,
            dateTitle: event.dateTitle
        }));
        log.info('Sample event dates from this page:', sampleDates);
        
        // Check if we have any events before the filter date - but only if we have a dateFrom filter
        const state = await context.crawler.useState();
        if (state.dateFrom) {
            const filterDate = new Date(state.dateFrom);
            const eventsBeforeFilter = events.filter(event => {
                if (event.localDate) {
                    const eventDate = new Date(event.localDate);
                    return eventDate < filterDate;
                }
                return false;
            });
            
            if (eventsBeforeFilter.length > 0) {
                log.warning(`Found ${eventsBeforeFilter.length} events before filter date (${state.dateFrom}) - date filter is NOT working properly`);
                log.warning('Sample events before filter date:', eventsBeforeFilter.slice(0, 3).map(e => ({
                    name: e.name,
                    localDate: e.localDate,
                    dateTitle: e.dateTitle
                })));
            } else {
                log.info(`All events are on or after filter date (${state.dateFrom}) - date filter appears to be working`);
            }
        } else {
            log.info('No dateFrom filter applied - not checking event dates');
        }
    }

    // handle maxItems restriction if set
    let actualEventsToProcess = events;
    if (maxItems) {
        const remainingItemsCount = maxItems - scrapedItems;
        if (remainingItemsCount < events.length) {
            actualEventsToProcess = events.slice(0, remainingItemsCount);
            log.info(`Limiting events to ${actualEventsToProcess.length} due to maxItems restriction (${remainingItemsCount} remaining)`);
        }
    }

    await Actor.pushData(actualEventsToProcess);

    const totalScrapedItems = scrapedItems + actualEventsToProcess.length;
    
    // Track the last event date for continuation
    let newLastEventDate = lastEventDate;
    if (actualEventsToProcess.length > 0) {
        const lastEvent = actualEventsToProcess[actualEventsToProcess.length - 1];
        
        // Try different possible date field structures
        if (lastEvent.localDate) {
            newLastEventDate = lastEvent.localDate;
            log.info(`Found localDate for continuation: ${newLastEventDate}`);
        } else if (lastEvent.dateTitle) {
            // Convert dateTitle to a proper date format if possible
            // This is a fallback, the localDate should be preferred
            log.info(`Using dateTitle as fallback for continuation: ${lastEvent.dateTitle}`);
            newLastEventDate = lastEvent.dateTitle;
        } else {
            log.warning(`No suitable date found in last event for continuation`, {
                eventName: lastEvent.name,
                availableFields: Object.keys(lastEvent).filter(key => key.toLowerCase().includes('date'))
            });
        }
    }
    
    // Update state with current progress
    const newState = {
        ...state,
        totalScrapedEvents: totalScrapedItems,
        lastEventDate: newLastEventDate
    };
    
    await context.crawler.useState(newState);
    
    // Also save to Actor key-value store for persistence
    await Actor.setValue('CRAWLER_STATE', newState);
    
    log.info(`
    Total results available: ${page.totalElements}
    Total pages available: ${page.totalPages}
    Current page: ${userData.page + 1}
    Events found on page: ${originalEventCount}
    Events actually processed: ${actualEventsToProcess.length}`, { url });
    log.info(`Total scraped events count: ${totalScrapedItems}`);
    
    // Check if we're approaching API limits (usually around 6-7 pages or 1200+ events)
    const isNearApiLimit = (userData.page >= 5) || (totalScrapedItems >= 1000);
    if (isNearApiLimit) {
        log.info(`Approaching potential API limits (page ${userData.page + 1}, ${totalScrapedItems} events)`);
    }

    // there are more events to scrape
    if (page.totalPages > userData.page + 1 && (!maxItems || totalScrapedItems < maxItems)) {
        const { crawler: { requestQueue } } = context;
        const nextRequest = buildFetchRequest({
            sortBy,
            countryCode,
            geoHash,
            distance,
            thisWeekendDate,
            dateFrom,
            dateTo,
            includeTBA,
            includeTBD,
        }, classifications, userData.page + 1, totalScrapedItems);

        log.info(`Enqueuing next search request for page: ${userData.page + 2}`);
        await requestQueue.addRequest(nextRequest);
    } else {
        // We've reached the end - determine if it's due to API limits or natural completion
        let hitLimit = false;
        
        if (page.totalPages <= userData.page + 1) {
            log.info(`Reached last page (${page.totalPages}). Crawling complete.`);
            // Check if this might be due to API limits (if totalElements suggests more pages should exist)
            const expectedPages = Math.ceil(page.totalElements / 200);
            if (expectedPages > page.totalPages) {
                log.warning(`Expected ${expectedPages} pages based on ${page.totalElements} total elements, but API only provided ${page.totalPages} pages. This suggests API pagination limits.`);
                hitLimit = true;
            }
        } else if (maxItems && totalScrapedItems >= maxItems) {
            log.info(`Reached maxItems limit (${maxItems}). Stopping crawl at ${totalScrapedItems} items.`);
        }
        
        // Update final state
        const finalState = {
            ...state,
            hitApiLimit: hitLimit,
            totalScrapedEvents: totalScrapedItems,
            lastEventDate: newLastEventDate
        };
        
        await context.crawler.useState(finalState);
        
        // Also save to Actor key-value store for persistence
        await Actor.setValue('CRAWLER_STATE', finalState);
    }
}

function getEventsFromResponse(items) {
    if (!items) {
        return [];
    }

    const events = items.map((item) => {
        const { jsonLd } = item;

        // classification info
        const { id, name, url, genreName, segmentName } = item;
        const { description, image } = jsonLd;

        // date
        const { datesFormatted: { dateTitle, dateSubTitle }, dates: { localDate, dateTBA, timeTBA } } = item;

        // location
        const { location, offers, performer } = jsonLd;
        const { address: { streetAddress, addressLocality, addressRegion, postalCode, addressCountry } } = location;

        // priceRanges
        const priceRanges = (item.priceRanges || []).map((range) => {
            // eslint-disable-next-line dot-notation
            delete range['__typename'];
            return range;
        });

        const placeUrl = location.sameAs;
        const offerUrl = offers.url;
        const { availabilityStarts, priceCurrency, price } = offers;
        const offer = {
            offerUrl,
            availabilityStarts,
            price: price ? parseFloat(price.replace(/,/g, '')) : null,
            priceCurrency: priceCurrency || null,
        };

        const performers = extractPerformers(performer);

        const event = {
            ...{ id, url, name, description, image, segmentName, genreName },
            ...{ dateTitle, dateSubTitle, localDate, dateTBA, timeTBA },
            ...{ streetAddress, addressLocality, addressRegion, postalCode, addressCountry, placeUrl },
            offer,
            priceRanges,
            performers,
        };

        return event;
    });

    return events;
}

function extractPerformers(performer) {
    const performers = performer.map((perf) => {
        const { name } = perf;
        const url = perf.sameAs;
        return { name, url };
    });

    return performers;
}
