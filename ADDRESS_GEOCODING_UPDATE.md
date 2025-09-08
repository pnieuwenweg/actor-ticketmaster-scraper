# Address-Based Geocoding Update Summary

## Changes Made

### 🏢 **Changed Geocoding Strategy**
**Before:** Used venue names extracted from description field for Mapbox geocoding
**After:** Use actual address components (street_address, postal_code, address_locality, etc.) for more accurate geocoding

### 📍 **New Address Priority Order**
The geocoding now builds location queries in this order:
1. **street_address** (most specific)
2. **address_locality** (city)
3. **postal_code** (for precision)
4. **address_region** (state/province)
5. **address_country** (country)

### 🔄 **Fallback Logic**
- If no address components are available → falls back to venue name
- All address parts are joined with commas: `"123 Main St, New York, 10001, NY, USA"`

### 🗺️ **Improved Geocoding Accuracy**
Address-based geocoding should provide:
- More precise coordinates (street-level vs. venue-level)
- Better consistency across events
- Reduced dependency on venue name extraction accuracy

### 💾 **Cache Benefits**
- Same events with identical addresses will hit cache more often
- Reduces Mapbox API calls
- Stores full address data in venue_coordinates table

### 📝 **Enhanced Logging**
New logs show:
- `🏢 Built address-based geocoding query: "123 Main St, New York, 10001, NY, USA"`
- `📍 Address parts: 123 Main St | New York | 10001 | NY | USA`
- `🏢 Venue name: "Madison Square Garden"`

## Example Before vs After

### Before (Venue-based):
```
Query: "Madison Square Garden, New York, NY, USA"
Result: Approximate venue location
```

### After (Address-based):
```
Query: "4 Pennsylvania Plaza, New York, 10001, NY, USA"
Result: Exact street address coordinates
```

## Files Modified
- ✅ `supabase/functions/apify-importer/index.ts` - Updated geocoding logic

## Testing
To test the new address-based geocoding:
1. Deploy the updated edge function
2. Import a run with events that have good address data
3. Check the logs to see address-based queries being used
4. Verify coordinates are more precise in the venue_coordinates table

The change should be backward compatible - if address data is missing, it falls back to venue names as before.
