import { Actor } from 'apify';
import { CheerioCrawler, log } from 'crawlee';

import { parseClassificationsToScrape } from './classifications-parser.js';
import { buildFetchRequest } from './request-builder.js';
import { REQUEST_TIMEOUT } from './consts.js';
import { categoriesRouter } from './routes/categories-crawler.js';
import { eventsRouter } from './routes/events-crawler.js';

await Actor.init();

const CATEGORY_PAGE_PREFIX = 'https://www.ticketmaster.com/discover/';

const input = await Actor.getInput();

const {
    maxItems,
    sortBy,
    countryCode, geoHash, distance,
    thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD,
    continuationMode, continuationStartDate, autoContinue
} = input;

log.info('Actor configuration:', {
    maxItems,
    sortBy,
    countryCode,
    geoHash,
    distance,
    dateFilter: { thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD },
    continuation: { continuationMode, continuationStartDate, autoContinue }
});

// Debug: Check if date parameters are being properly extracted from input
log.info('Date filtering debug:', {
    inputDateFrom: input.dateFrom,
    inputDateTo: input.dateTo,
    inputThisWeekendDate: input.thisWeekendDate,
    extractedDateFrom: dateFrom,
    extractedDateTo: dateTo,
    extractedThisWeekendDate: thisWeekendDate,
    continuationMode: continuationMode,
    continuationStartDate: continuationStartDate
});

// Handle continuation mode - override dateFrom if continuation is enabled
let effectiveDateFrom = dateFrom;
if (continuationMode && continuationStartDate) {
    effectiveDateFrom = continuationStartDate;
    log.info('Continuation mode enabled - starting from:', continuationStartDate);
}

const categories = ['concerts', 'sports', 'arts-theater', 'family'];
const categoryUrls = categories.map((category) => CATEGORY_PAGE_PREFIX + category);

// residential proxy is required due to Ticketmaster's strict blocking policy
// datacenter proxies get blocked by default
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
});

const categoriesCrawler = new CheerioCrawler({
    proxyConfiguration,
    requestHandlerTimeoutSecs: REQUEST_TIMEOUT,
    requestHandler: categoriesRouter,
});

const state = await categoriesCrawler.useState({
    maxItems,
    sortBy,
    countryCode,
    geoHash,
    distance,
    thisWeekendDate,
    dateFrom: effectiveDateFrom,
    dateTo,
    includeTBA,
    includeTBD,
    continuationMode,
    autoContinue,
    totalScrapedEvents: 0,
    lastEventDate: null,
    hitApiLimit: false
});

log.info('Starting categories crawl.');
await categoriesCrawler.run(categoryUrls);
log.info('Categories crawl finished.');

// whole input object passed as parameter as it contains large amount of bool properties representing classification IDs
const classifications = parseClassificationsToScrape(input, state);

log.info('Classifications parsing result:', {
    classificationsCount: classifications.length,
    classifications: classifications,
    inputCategories: {
        concerts: input.concerts,
        sports: input.sports,
        'arts-theater': input['arts-theater'],
        family: input.family
    }
});

const startRequest = buildFetchRequest({
    sortBy,
    countryCode,
    geoHash,
    distance,
    thisWeekendDate,
    dateFrom: effectiveDateFrom,
    dateTo,
    includeTBA,
    includeTBD,
}, classifications);

const eventsCrawler = new CheerioCrawler({
    proxyConfiguration,
    requestHandlerTimeoutSecs: REQUEST_TIMEOUT,
    requestHandler: eventsRouter,
});

await eventsCrawler.useState(state);

log.info('Starting events crawl.');
await eventsCrawler.run([startRequest]);
log.info('Events crawl finished.');

// Add final statistics
const finalState = await eventsCrawler.useState();
log.info('Final crawl statistics:', {
    finalState: finalState
});

// Check if we hit API limits and handle continuation
const { totalScrapedEvents, lastEventDate, hitApiLimit } = finalState;

// Log a summary of what was achieved
log.info('=== CRAWL SUMMARY ===');
if (hitApiLimit) {
    log.info('This crawl hit Ticketmaster API pagination limits.');
    log.info(`Successfully scraped ${totalScrapedEvents} events.`);
    log.info(`Last event date processed: ${lastEventDate}`);
    
    if (autoContinue && lastEventDate) {
        log.info('Auto-continue is enabled. Preparing continuation run...');
        
        // Save continuation data to key-value store for next run
        await Actor.setValue('CONTINUATION_DATA', {
            continuationStartDate: lastEventDate,
            totalEventsScraped: totalScrapedEvents,
            originalDateFrom: dateFrom,
            originalDateTo: dateTo,
            runNumber: (finalState.runNumber || 0) + 1
        });
        
        log.info('Continuation data saved. You can now start a new run with:');
        log.info(`- continuationMode: true`);
        log.info(`- continuationStartDate: ${lastEventDate}`);
        
        // Note: Automatic re-queuing would require Apify platform integration
        // For now, we'll just provide the continuation information
    } else {
        log.info('To continue scraping more events, start a new run with:');
        log.info(`- continuationMode: true`);
        log.info(`- continuationStartDate: ${lastEventDate}`);
    }
} else {
    log.info('Crawl completed successfully - all available events were scraped.');
    log.info(`Total events scraped: ${totalScrapedEvents}`);
}

log.info('Ticketmaster API limits: ~1200-1400 events per run (6-7 pages).');
log.info('Use continuation mode to scrape larger datasets.');

await Actor.exit();
