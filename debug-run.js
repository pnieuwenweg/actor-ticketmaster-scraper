import { Actor } from 'apify';

// Test script to debug the scraping discrepancy
const testInput = {
    maxItems: 5000, // Set this to your actual limit
    concerts: true,
    sports: false,
    'arts-theater': false,
    family: false,
    sortBy: 'date',
    countryCode: 'US',
    geoHash: 'dr5regw3pg6ft',
    distance: 100,
    includeTBA: 'yes',
    includeTBD: 'yes'
};

console.log('Test input configuration:');
console.log(JSON.stringify(testInput, null, 2));

// Export for easier testing
export default testInput;

// Instructions:
// 1. Run the actor with this configuration
// 2. Check the detailed logs for:
//    - REQUEST DEBUG INFO: Shows each request being made
//    - RESPONSE DEBUG INFO: Shows response structure 
//    - PRODUCTS DEBUG INFO: Shows pagination details
//    - Classification parsing results
// 3. Look for patterns in when the crawling stops
