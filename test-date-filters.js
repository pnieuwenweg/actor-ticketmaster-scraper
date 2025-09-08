import { buildFetchRequest } from './src/request-builder.js';

// Test different date filter scenarios
console.log('=== Testing Date Filters ===\n');

const baseParams = {
    sortBy: 'date',
    countryCode: 'NL',
    geoHash: 'dr5regw3pg6ft',
    distance: 100,
    includeTBA: 'yes',
    includeTBD: 'yes'
};

const classifications = [];

// Test 1: No date filter
console.log('1. No date filter:');
const request1 = buildFetchRequest(baseParams, classifications);
console.log('Request generated\n');

// Test 2: This weekend filter
console.log('2. This weekend filter:');
const request2 = buildFetchRequest({
    ...baseParams,
    thisWeekendDate: true
}, classifications);
console.log('Request generated\n');

// Test 3: Date range filter
console.log('3. Date range filter (2025-09-10 to 2025-09-20):');
const request3 = buildFetchRequest({
    ...baseParams,
    dateFrom: '2025-09-10',
    dateTo: '2025-09-20'
}, classifications);
console.log('Request generated\n');

// Test 4: Only dateFrom
console.log('4. Only dateFrom (2025-09-15):');
const request4 = buildFetchRequest({
    ...baseParams,
    dateFrom: '2025-09-15'
}, classifications);
console.log('Request generated\n');

// Test 5: Only dateTo
console.log('5. Only dateTo (2025-12-31):');
const request5 = buildFetchRequest({
    ...baseParams,
    dateTo: '2025-12-31'
}, classifications);
console.log('Request generated\n');

console.log('=== Test completed ===');
console.log('Run this with: node test-date-filters.js');
