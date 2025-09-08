import { Actor } from 'apify';
import { log } from 'crawlee';

// Enhanced debugging for events crawler
export async function debugEventsHandler(context) {
    const { request, json, response } = context;
    const { url, userData } = request;
    const { scrapedItems, classifications } = userData;

    // Log request details
    log.info('=== REQUEST DEBUG INFO ===', {
        url: url,
        page: userData.page,
        scrapedItems: userData.scrapedItems,
        statusCode: response?.statusCode,
        headers: response?.headers
    });

    // Log response structure
    log.info('=== RESPONSE DEBUG INFO ===', {
        hasJson: !!json,
        hasData: !!(json && json.data),
        hasProducts: !!(json && json.data && json.data.products),
        responseKeys: json ? Object.keys(json) : [],
        dataKeys: (json && json.data) ? Object.keys(json.data) : []
    });

    if (json && json.data && json.data.products) {
        const { page, items } = json.data.products;
        
        log.info('=== PRODUCTS DEBUG INFO ===', {
            currentPage: page.number,
            totalPages: page.totalPages,
            totalElements: page.totalElements,
            itemsCount: items ? items.length : 0,
            expectedPage: userData.page,
            pageDiscrepancy: page.number !== userData.page
        });

        // Check for any errors or warnings in the response
        if (json.errors) {
            log.error('API returned errors:', json.errors);
        }

        if (json.data.errors) {
            log.error('API data contains errors:', json.data.errors);
        }
    }

    return json;
}
