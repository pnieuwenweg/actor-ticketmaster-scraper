/**
 * Example script showing how to use the continuation feature
 * to scrape all events by bypassing Ticketmaster's API pagination limits
 */

import { Actor } from 'apify';

/**
 * Example 1: Manual Continuation
 * Run this after your first scrape to continue from where it left off
 */
export async function runManualContinuation() {
    // Configuration for continuation run
    const continuationInput = {
        // Basic settings (same as original run)
        maxItems: 5000,
        sortBy: "date",
        countryCode: "NL",
        distance: 100,
        concerts: true,
        sports: false,
        "arts-theater": false,
        family: false,
        
        // Date range (same as original)
        dateFrom: "2025-11-14",
        dateTo: "2025-12-31",
        includeTBA: "yes",
        includeTBD: "yes",
        
        // Continuation settings
        continuationMode: true,
        continuationStartDate: "2025-11-25T19:30:00", // Set this to the lastEventDate from previous run
        autoContinue: false
    };
    
    console.log('Starting continuation run with input:', continuationInput);
    
    // This would be used with Apify.call() in practice:
    // const run = await Actor.call('your-actor-id', continuationInput);
    // return run;
}

/**
 * Example 2: Automated Multi-Run Scraping
 * This function demonstrates how to chain multiple runs together
 */
export async function scrapeAllEventsWithContinuation(baseInput, actorId = null) {
    let allEvents = [];
    let currentStartDate = baseInput.dateFrom;
    let runNumber = 1;
    let hasMoreEvents = true;
    
    while (hasMoreEvents && runNumber <= 10) { // Safety limit of 10 runs
        console.log(`\n=== RUN ${runNumber} ===`);
        console.log(`Starting from date: ${currentStartDate}`);
        
        const runInput = {
            ...baseInput,
            continuationMode: runNumber > 1,
            continuationStartDate: runNumber > 1 ? currentStartDate : undefined,
            autoContinue: false
        };
        
        console.log('Run input:', runInput);
        
        // In practice, you would call your actor here:
        if (actorId) {
            // const run = await Actor.call(actorId, runInput);
            // const { items } = await run.dataset().listItems();
            // allEvents.push(...items);
            
            // Check continuation data
            // const continuationData = await run.keyValueStore().getValue('CONTINUATION_DATA');
            // if (continuationData && continuationData.continuationStartDate) {
            //     currentStartDate = continuationData.continuationStartDate;
            //     runNumber++;
            // } else {
            //     hasMoreEvents = false;
            // }
        } else {
            console.log('No actor ID provided - this is just a demonstration');
            hasMoreEvents = false;
        }
        
        // For demo purposes, show how continuation would work
        if (runNumber === 1) {
            console.log('First run would scrape ~1200 events and save continuation data');
            console.log('Example continuation data: { continuationStartDate: "2025-11-25T19:30:00", totalEventsScraped: 1200 }');
            currentStartDate = "2025-11-25T19:30:00";
            runNumber++;
        } else {
            console.log('Subsequent runs would continue from where previous run stopped');
            hasMoreEvents = false; // End demo
        }
    }
    
    console.log(`\nCompleted scraping with ${runNumber - 1} runs`);
    console.log(`Total events collected: ${allEvents.length}`);
    
    return allEvents;
}

/**
 * Example 3: Configuration for Different Scenarios
 */
export const continuationExamples = {
    // Scrape all events from a specific date onwards
    allEventsFromDate: {
        maxItems: 10000,
        sortBy: "date",
        countryCode: "NL",
        distance: 100,
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
        concerts: true,
        sports: true,
        "arts-theater": true,
        family: true,
        continuationMode: false, // Set to true for continuation runs
        autoContinue: false
    },
    
    // Continue from a specific event date
    continueFromSpecificDate: {
        maxItems: 5000,
        sortBy: "date",
        countryCode: "NL", 
        distance: 100,
        dateFrom: "2025-11-14",
        dateTo: "2025-12-31",
        concerts: true,
        continuationMode: true,
        continuationStartDate: "2025-11-20T15:30:00", // Start from this specific date/time
        autoContinue: false
    },
    
    // Large-scale scraping with auto-continuation (experimental)
    autoContMode: {
        maxItems: 50000,
        sortBy: "date",
        countryCode: "US", // Larger country = more events
        distance: 500,
        dateFrom: "2025-01-01",
        dateTo: "2026-12-31",
        concerts: true,
        sports: true,
        "arts-theater": true,
        family: true,
        continuationMode: false,
        autoContinue: true // Enable experimental auto-continuation
    }
};

/**
 * Usage Instructions
 */
export const usageInstructions = `
CONTINUATION MODE USAGE:

1. FIRST RUN:
   - Set continuationMode: false
   - Set your desired date range (dateFrom, dateTo)
   - Run the actor
   - Check logs for "lastEventDate" when it hits API limits

2. CONTINUATION RUNS:
   - Set continuationMode: true
   - Set continuationStartDate to the lastEventDate from previous run
   - Keep all other settings the same
   - Repeat until no more events

3. AUTOMATED APPROACH:
   - Use the scrapeAllEventsWithContinuation() function
   - Or enable autoContinue: true (experimental)

EXAMPLE WORKFLOW:

Run 1: dateFrom="2025-11-14" → scrapes ~1200 events → lastEventDate="2025-11-25T19:30:00"
Run 2: continuationStartDate="2025-11-25T19:30:00" → scrapes next ~1200 events → lastEventDate="2025-12-05T20:00:00"
Run 3: continuationStartDate="2025-12-05T20:00:00" → scrapes remaining events → complete

TIPS:
- Always use the same sortBy, location, and filter settings across continuation runs
- The lastEventDate includes time, so you won't miss any events
- Monitor your Apify usage as each continuation run consumes compute units
- Consider using smaller date ranges if you expect very large datasets
`;

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(usageInstructions);
    console.log('\nExample configurations:');
    console.log(JSON.stringify(continuationExamples, null, 2));
    
    // Demo the multi-run approach
    await scrapeAllEventsWithContinuation(continuationExamples.allEventsFromDate);
}
