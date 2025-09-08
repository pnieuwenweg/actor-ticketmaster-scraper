# Three-Phase Import Implementation Summary

## ✅ **Successfully Restructured Import Process**

The `importEventsFromRun` function has been completely restructured into three distinct phases:

### 🚀 **Three-Phase Architecture**

#### **📥 Phase 1: Fetch Apify Data and Store**
- **Function:** `fetchAndStoreApifyData(runId, runStartedAt)`
- **Purpose:** Get data from Apify API and store in `apify_ticketmaster` table
- **Operations:**
  - Fetch run details and dataset from Apify API
  - Filter out TBA and invalid events
  - Create normalized event IDs
  - Parse dates and prepare event data
  - Upsert into `apify_ticketmaster` table
  - Track new vs updated events

#### **🗺️ Phase 2: Geocode Addresses**
- **Function:** `geocodeStoredEvents(runId)`
- **Purpose:** Process addresses with Mapbox and cache coordinates
- **Operations:**
  - Fetch events from `apify_ticketmaster` for the run
  - Build address-based location queries (street_address + locality + postal_code + region + country)
  - Call Mapbox geocoding API for each unique location
  - Cache results in `venue_coordinates` table
  - Continue even if some geocoding fails

#### **📋 Phase 3: Copy to Main Events Table**
- **Function:** `copyToMainEventsTable(runId)`
- **Purpose:** Transform and copy events to main `events` table
- **Operations:**
  - Fetch processed events from `apify_ticketmaster`
  - Check which events already exist in main `events` table
  - Retrieve cached coordinates from `venue_coordinates`
  - Format dates, descriptions, and event data for main table
  - Insert new events into `events` table

### 🔄 **Workflow Benefits**

1. **Better Error Handling:** Each phase can fail independently without affecting others
2. **Improved Performance:** Geocoding is separated from data fetching
3. **Cache Efficiency:** Address-based geocoding uses cached coordinates when available
4. **Cleaner Separation:** Data fetching → Processing → Storage
5. **Better Debugging:** Clear logs for each phase with success/failure counts

### 📊 **Enhanced Logging**

Each phase provides detailed logging:
- **Phase 1:** Events fetched, filtered, and stored counts
- **Phase 2:** Geocoding attempts, successes, and failures
- **Phase 3:** Events copied to main table with coordinate status

### 🎯 **Address-Based Geocoding Priority**

Phase 2 now uses this priority order for location queries:
1. `street_address` (most specific)
2. `address_locality` (city)
3. `postal_code` (precision)
4. `address_region` (state/province)
5. `address_country` (country)

**Example:** `"123 Main Street, New York, 10001, NY, USA"`

### 📈 **Expected Improvements**

- **More Accurate Coordinates:** Street-level precision instead of venue-level
- **Better Cache Hit Rates:** Consistent address formatting
- **Reduced API Calls:** Mapbox calls only when not cached
- **Improved Reliability:** Each phase handles errors independently
- **Better Performance:** Separation allows for optimizations

## 🚀 **Ready to Test**

The three-phase implementation is now ready. Each phase runs sequentially:
1. **Phase 1** stores data in `apify_ticketmaster`
2. **Phase 2** geocodes addresses and caches coordinates
3. **Phase 3** copies events to main `events` table with coordinates

This provides better error handling, performance, and maintainability compared to the previous single-function approach.
