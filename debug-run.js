import { Actor } from 'apify';

// Test configurations for date filter debugging
const testConfigs = {
    // Test 1: No date filter
    noDateFilter: {
        maxItems: 50,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        includeTBA: 'yes',
        includeTBD: 'yes'
    },

    // Test 2: This weekend filter
    thisWeekend: {
        maxItems: 50,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        thisWeekendDate: true,
        includeTBA: 'yes',
        includeTBD: 'yes'
    },

    // Test 3: Date range filter
    dateRange: {
        maxItems: 50,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        dateFrom: '2025-09-10',
        dateTo: '2025-09-20',
        includeTBA: 'yes',
        includeTBD: 'yes'
    },

    // Test 4: Only dateFrom
    dateFromOnly: {
        maxItems: 50,
        concerts: true,
        sports: false,
        'arts-theater': false,
        family: false,
        sortBy: 'date',
        countryCode: 'NL',
        distance: 100,
        dateFrom: '2025-12-01',
        includeTBA: 'yes',
        includeTBD: 'yes'
    }
};

console.log('=== Date Filter Test Configurations ===');
console.log('Available test configurations:');
Object.keys(testConfigs).forEach(key => {
    console.log(`- ${key}`);
});

console.log('\nTo test a specific configuration, use one of these in your actor run:');
Object.entries(testConfigs).forEach(([key, config]) => {
    console.log(`\n${key}:`);
    console.log(JSON.stringify(config, null, 2));
});

console.log('\n=== Instructions ===');
console.log('1. Copy one of the configurations above');
console.log('2. Use it as input for your actor');
console.log('3. Check the logs for "Date filter input:" and "Final request variables:"');
console.log('4. Compare the results to see if date filtering works');

export default testConfigs;
