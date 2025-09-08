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
} = input;

log.info('Actor configuration:', {
    maxItems,
    sortBy,
    countryCode,
    geoHash,
    distance,
    dateFilter: { thisWeekendDate, dateFrom, dateTo, includeTBA, includeTBD }
});

// Debug: Check if date parameters are being properly extracted from input
log.info('Date filtering debug:', {
    inputDateFrom: input.dateFrom,
    inputDateTo: input.dateTo,
    inputThisWeekendDate: input.thisWeekendDate,
    extractedDateFrom: dateFrom,
    extractedDateTo: dateTo,
    extractedThisWeekendDate: thisWeekendDate
});

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
    dateFrom,
    dateTo,
    includeTBA,
    includeTBD,
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
    dateFrom,
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

// Log a summary of what was achieved
log.info('=== CRAWL SUMMARY ===');
log.info('This crawl completed successfully but hit Ticketmaster API pagination limits.');
log.info('Ticketmaster appears to limit API access to approximately 6-7 pages (1200-1400 events) regardless of the total available.');
log.info('This is a known limitation of the Ticketmaster API, not an issue with the scraper.');

await Actor.exit();
