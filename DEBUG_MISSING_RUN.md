# Debug and Fix Missing Run Issue

## Problem
You're experiencing:
1. "Cannot read properties of undefined (reading 'error')" - **FIXED** ✅
2. Missing one run with ~1200 events from the Apify actor

## Error Fixes Applied

### Fixed undefined property access errors:
- `checkError.message` → `checkError?.message || String(checkError) || 'Unknown error'`
- `mainTableCheckError` → `mainTableCheckError?.message || String(mainTableCheckError) || 'Unknown error'`

These changes prevent the "Cannot read properties of undefined" error by using optional chaining and fallback values.

## Finding the Missing Run

### Step 1: Debug Script to Find Missing Run
```bash
# Set your Apify token (replace with your actual token)
export APIFY_TOKEN="your_apify_api_token_here"

# Run the debug script to find runs with ~1200 events
node debug-missing-run.js
```

This script will:
- List all recent runs from your Apify actor
- Show event counts for each run
- Highlight runs with ~1200 events (likely your missing run)
- Provide the exact run ID to import

### Step 2: Import the Specific Run
Once you identify the missing run ID from the debug script:

```bash
# Set your Supabase environment variables
export SUPABASE_URL="your_supabase_url"
export SUPABASE_ANON_KEY="your_supabase_anon_key"

# Import the specific run (replace RUN_ID with actual ID)
node import-specific-run.js [RUN_ID]
```

## Alternative: Manual Edge Function Call

If the scripts don't work, you can call the edge function directly:

```bash
curl -X POST "https://your-project.supabase.co/functions/v1/apify-importer" \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "import_specific_runs", "runIds": ["YOUR_RUN_ID"]}'
```

## Verification

After importing, verify the import worked:

1. Check the response for success status
2. Verify event counts in your database
3. Check that geocoding completed for new events

## Prevention

To prevent this issue in the future:

1. The error handling fixes should prevent the undefined property errors
2. Consider running imports more frequently to catch any missed runs
3. Monitor the edge function logs for any new error patterns

## Environment Variables Needed

For debug script:
- `APIFY_TOKEN` - Your Apify API token

For import script:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon public key

## Files Created/Modified

- ✅ `index.ts` - Fixed undefined property access errors
- 🆕 `debug-missing-run.js` - Script to find missing runs
- 🆕 `import-specific-run.js` - Script to import specific run
- 🆕 `DEBUG_MISSING_RUN.md` - This guide

Run the debug script first to identify which run has your missing 1200 events!
