import { Actor } from 'apify';

// Test configurations for date filter debugging
const testConfigs = {
    // Test 1: Very restrictive date range (should return fewer results)
    veryRestrictiveDate: {
        maxItems: 200,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        dateFrom: '2026-12-01', // Far future date
        dateTo: '2026-12-31',   // Far future date
        includeTBA: 'no',       // Exclude TBA events
        includeTBD: 'no'        // Exclude TBD events
    },

    // Test 2: Near future date range
    nearFutureDate: {
        maxItems: 200,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        dateFrom: '2025-12-01',
        dateTo: '2025-12-31',
        includeTBA: 'no',
        includeTBD: 'no'
    },

    // Test 3: Your original test (November 14, 2025)
    novemberTest: {
        maxItems: 50,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        dateFrom: '2025-11-14',
        includeTBA: 'no',
        includeTBD: 'no'
    },

    // Test 4: Current time forward (should be similar to no filter)
    currentTimeForward: {
        maxItems: 50,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        dateFrom: '2025-09-08', // Today
        includeTBA: 'no',
        includeTBD: 'no'
    }
};

console.log('=== Date Filter Test Configurations ===');
console.log('These configurations will help determine if date filtering works:');
console.log('');

console.log('1. veryRestrictiveDate: Far future dates (2026) - should return 0 or very few events');
console.log('2. nearFutureDate: December 2025 - should return fewer events than no filter');
console.log('3. novemberTest: Your original test with TBA/TBD excluded');
console.log('4. currentTimeForward: From today - should return many events (similar to no filter)');
console.log('');

console.log('Expected behavior:');
console.log('- veryRestrictiveDate should return much fewer total events');
console.log('- Each test should show different "totalElements" counts if filtering works');
console.log('- Check the sample event dates in logs to verify actual dates returned');
console.log('');

Object.entries(testConfigs).forEach(([key, config]) => {
    console.log(`${key}:`);
    console.log(JSON.stringify(config, null, 2));
    console.log('');
});

console.log('=== How to Interpret Results ===');
console.log('1. If date filtering works: totalElements should vary significantly between tests');
console.log('2. If date filtering doesn\'t work: totalElements will be the same (~2600+)');
console.log('3. Check "Sample event dates" logs to see actual event dates returned');
console.log('4. Look for warnings about events before filter date');

export default testConfigs;
