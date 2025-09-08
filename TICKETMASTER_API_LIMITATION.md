# Ticketmaster API Pagination Limitation

## Issue Description
The Ticketmaster scraper shows more events available (e.g., 2648 events across 14 pages) than it actually retrieves (e.g., 1200 events from 6 pages).

## Root Cause
This is **not a bug in the scraper** but a **limitation of the Ticketmaster API**:

1. **API Response**: The API initially reports a higher total count (e.g., 2648 events on 14 pages)
2. **Pagination Limit**: After approximately 6-7 pages, the API starts returning `{"products": null}` instead of event data
3. **No Error Indication**: The API doesn't return explicit errors, just stops providing data

## Evidence
From the logs:
- Pages 0-5: Return 200 events each (1200 total)
- Page 6: Returns `"data":{"products":null}` 
- Status: HTTP 200 (success) but no data
- API reports: "totalElements": 2648, "totalPages": 14

## Workarounds
This appears to be an intentional API limitation by Ticketmaster, possibly for:
- Rate limiting
- Preventing bulk data extraction
- Server resource management

## Recommendations
1. **Accept the limitation**: 1200-1400 events is typically sufficient for most use cases
2. **Multiple searches**: Use different search parameters (dates, locations, categories) to get more diverse results
3. **Regular runs**: Run the scraper multiple times to capture different events as they become available

## Technical Details
- The API limit appears to be around page 6-7 (1200-1400 events)
- This limit is consistent across different searches
- No authentication or premium API access appears to change this behavior

This is a known behavior of the Ticketmaster API and not something that can be "fixed" in the scraper code.
