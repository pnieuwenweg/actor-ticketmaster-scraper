# Ticketmaster Scraper - Continuation Mode Guide

## 🎯 Problem Solved

**Before**: Ticketmaster API limited you to ~1200 events per run, making it impossible to scrape large datasets.

**After**: With Continuation Mode, you can scrape unlimited events by chaining multiple runs together!

## 🚀 How It Works

### 1. **First Run (Initial Scrape)**
```json
{
  "maxItems": 5000,
  "sortBy": "date",
  "countryCode": "NL",
  "distance": 100,
  "concerts": true,
  "dateFrom": "2025-11-14",
  "dateTo": "2025-12-31",
  "continuationMode": false,
  "autoContinue": false
}
```

**Result**: Scrapes ~1200 events, hits API limit, logs show:
```
INFO  Last event date processed: 2025-11-25T19:30:00
INFO  To continue scraping, start a new run with:
INFO  - continuationMode: true
INFO  - continuationStartDate: 2025-11-25T19:30:00
```

### 2. **Continuation Run**
```json
{
  "maxItems": 5000,
  "sortBy": "date",
  "countryCode": "NL",
  "distance": 100,
  "concerts": true,
  "dateFrom": "2025-11-14",
  "dateTo": "2025-12-31",
  "continuationMode": true,
  "continuationStartDate": "2025-11-25T19:30:00",
  "autoContinue": false
}
```

**Result**: Continues from where first run stopped, scrapes next ~1200 events.

### 3. **Repeat Until Complete**
Keep running continuation runs until you've scraped all available events.

## 📋 Step-by-Step Instructions

### Option A: Manual Continuation

1. **Run 1**: Use `test-continuation-initial.json` configuration
2. **Check logs**: Find the `lastEventDate` when run completes  
3. **Run 2**: Update `test-continuation-second.json` with the `lastEventDate`
4. **Repeat**: Continue until no more events

### Option B: Programmatic Approach

Use the `continuation-example.js` helper script:

```javascript
import { scrapeAllEventsWithContinuation } from './continuation-example.js';

const baseConfig = {
  maxItems: 10000,
  sortBy: "date", 
  countryCode: "NL",
  dateFrom: "2025-01-01",
  dateTo: "2025-12-31",
  concerts: true
};

// This will automatically handle multiple continuation runs
await scrapeAllEventsWithContinuation(baseConfig, 'your-actor-id');
```

## 🔧 New Input Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `continuationMode` | boolean | Enable continuation from previous run |
| `continuationStartDate` | string | Date to start from (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS) |
| `autoContinue` | boolean | Experimental: Auto-trigger next run |

## ⚠️ Important: Date Filtering Fix

**Critical Discovery**: Ticketmaster's API requires BOTH start and end dates for filtering to work properly. 

- ❌ **Wrong**: `dateFrom: "2025-11-14"` (only start date) → Returns ALL events
- ✅ **Correct**: `dateFrom: "2025-11-14", dateTo: "2025-12-31"` → Properly filters events

**Automatic Fix**: The actor now automatically adds a far-future end date (2030-12-31) when only `dateFrom` is provided, ensuring the filter works correctly.

## 💡 Pro Tips

### ✅ Best Practices
- **Keep settings consistent**: Use same `sortBy`, `countryCode`, `distance` across all continuation runs
- **Use precise timestamps**: The `lastEventDate` includes time to prevent missing events
- **Monitor usage**: Each continuation run consumes compute units
- **Start small**: Test with narrow date ranges first

### ⚠️ Important Notes
- Always use `sortBy: "date"` for continuation to work properly
- The `continuationStartDate` should be exactly the `lastEventDate` from previous run
- Events are never duplicated - continuation starts from the next event after the given date
- Keep your original `dateFrom` and `dateTo` - these define the overall scope

## 📊 Example Results

### Single Run (Before)
- **Events scraped**: ~1200
- **Time range covered**: Nov 14 - Nov 25
- **Coverage**: Partial

### With Continuation (After)  
- **Run 1**: 1200 events (Nov 14 - Nov 25)
- **Run 2**: 1150 events (Nov 25 - Dec 5) 
- **Run 3**: 890 events (Dec 5 - Dec 31)
- **Total**: 3240 events
- **Coverage**: Complete!

## 🐛 Troubleshooting

### "Getting events before my dateFrom filter"
- **Fixed**: This was a bug where single `dateFrom` wasn't working
- **Solution**: Actor now automatically adds end date (2030-12-31) when only `dateFrom` is provided
- **Best Practice**: Always provide both `dateFrom` and `dateTo` for explicit control

### "No events found in continuation run"
- Check that `continuationStartDate` is correctly formatted
- Verify there are actually more events after that date
- Ensure all filter settings match the original run

### "Getting duplicate events"
- Make sure you're using the exact `lastEventDate` from logs
- Don't modify the date format or add/remove seconds

### "Runs are slow"
- This is normal - each run needs to go through API pagination
- Consider using smaller date ranges for faster individual runs

## 🔮 Future Enhancements

The continuation feature opens up possibilities for:
- **Scheduled scraping**: Run daily/weekly to capture new events
- **Large-scale monitoring**: Track events across multiple countries/regions  
- **Historical analysis**: Scrape events across entire years
- **Real-time updates**: Continuous scraping with auto-continuation

---

**Ready to scrape unlimited Ticketmaster events? Start with the test configurations and scale up!** 🎟️
