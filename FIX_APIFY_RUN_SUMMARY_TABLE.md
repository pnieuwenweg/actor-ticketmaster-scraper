# Fixing apify_run_summary Table Schema Issue

## Problem
The edge function is failing with the error:
```
Could not find the 'events_imported' column of 'apify_run_summary' in the schema cache
```

When trying to drop the table, you get:
```
ERROR: 42809: "apify_run_summary" is not a table
HINT: Use DROP VIEW to remove a view.
```

## Root Cause
The `apify_run_summary` exists as a **view**, not a table, and this view doesn't have the columns that the code expects to insert data into. Views are read-only and cannot have data inserted into them directly.

## Solution

### Option 1: Using Supabase Dashboard (Recommended)

**IMPORTANT: First check what the existing view does**
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the queries in `check-existing-view.sql` to see what the current view looks like
4. **Save the view definition** if it contains important logic you want to preserve
5. Then run the `create-apify-run-summary-table.sql` to replace the view with a table

**Steps:**
1. Copy and paste the contents of `check-existing-view.sql` first
2. Click **Run** and note down the results
3. Then copy and paste the contents of `create-apify-run-summary-table.sql`
4. Click **Run** to create the new table

### Option 2: Using Supabase CLI
If you have the Supabase CLI installed and configured:
```bash
# Run the provided script
./create-table.sh

# Or manually execute the SQL
supabase db push
```

### Option 3: Manual Table Creation
If the above options don't work, you can create the table manually in your database:

```sql
-- Create the apify_run_summary table
CREATE TABLE apify_run_summary (
    apify_run_id VARCHAR(255) PRIMARY KEY,
    run_started_at TIMESTAMP WITH TIME ZONE,
    events_imported INTEGER DEFAULT 0,
    new_events INTEGER DEFAULT 0,
    updated_events INTEGER DEFAULT 0,
    main_table_inserts INTEGER DEFAULT 0,
    geocoding_calls INTEGER DEFAULT 0,
    geocoding_successful INTEGER DEFAULT 0,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Table Schema Explanation

The `apify_run_summary` table tracks the processing status and results of each Apify run:

- **apify_run_id**: Primary key, unique identifier for each Apify run
- **run_started_at**: When the Apify run was started
- **events_imported**: Total number of events imported from this run
- **new_events**: Number of new events (not previously seen)
- **updated_events**: Number of events that were updates to existing events
- **main_table_inserts**: Number of events inserted into the main events table
- **geocoding_calls**: Number of geocoding API calls made
- **geocoding_successful**: Number of successful geocoding operations
- **processed_at**: When this run was processed by our edge function
- **status**: Processing status (typically 'completed')

## Code Changes Made

The `recordRunSummary` function has been updated to be more resilient:
- It tries to insert all fields first
- If there are schema errors (missing columns), it falls back to basic fields only
- This prevents the entire import process from failing due to table schema issues

## After Creating the Table

Once the table is created with the correct schema:
1. The edge function will work properly
2. Run summaries will be recorded with full details
3. The single-run processing logic will correctly skip already processed runs

## Verification

To verify the table was created correctly, run this query in your Supabase SQL Editor:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'apify_run_summary'
ORDER BY ordinal_position;
```

You should see all the columns listed above.
