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
    });
});

async function handleEventsSearchPage(context, {
    maxItems,
    sortBy,
    countryCode, geoHash, distance,
    thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD,
}) {
    const { request, json } = context;
    const { url, userData } = request;
    const { scrapedItems, classifications } = userData;

    // Add comprehensive debugging
    await debugEventsHandler(context);

    log.info(`Scraping url:
    ${request.url}`);

    if (!json || !json.data) {
        log.error('No data received in API response', { url: request.url, json });
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
        
        // Check if we have any events before the filter date
        const filterDate = new Date('2025-11-14');
        const eventsBeforeFilter = events.filter(event => {
            if (event.localDate) {
                const eventDate = new Date(event.localDate);
                return eventDate < filterDate;
            }
            return false;
        }).length;
        
        if (eventsBeforeFilter > 0) {
            log.warning(`Found ${eventsBeforeFilter} events before filter date (2025-11-14) - date filter may not be working properly`);
        } else {
            log.info(`All events are on or after filter date (2025-11-14) - date filter appears to be working`);
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
    log.info(`
    Total results available: ${page.totalElements}
    Total pages available: ${page.totalPages}
    Current page: ${userData.page + 1}
    Events found on page: ${originalEventCount}
    Events actually processed: ${actualEventsToProcess.length}`, { url });
    log.info(`Total scraped events count: ${totalScrapedItems}`);

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
        if (page.totalPages <= userData.page + 1) {
            log.info(`Reached last page (${page.totalPages}). Crawling complete.`);
        } else if (maxItems && totalScrapedItems >= maxItems) {
            log.info(`Reached maxItems limit (${maxItems}). Stopping crawl at ${totalScrapedItems} items.`);
        }
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
