-- STEP-BY-STEP SOLUTION FOR apify_run_summary VIEW TO TABLE CONVERSION

-- Step 1: Check what the existing view looks like (BACKUP PURPOSES)
-- Uncomment and run this first to see the current view definition:
/*
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views 
WHERE viewname = 'apify_run_summary';

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'apify_run_summary'
ORDER BY ordinal_position;
*/

-- Step 2: Drop the existing view
DROP VIEW IF EXISTS apify_run_summary CASCADE;

-- Step 3: Create the new table with all required columns
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

-- Step 4: Create performance indexes
CREATE INDEX idx_apify_run_summary_run_started_at ON apify_run_summary(run_started_at);
CREATE INDEX idx_apify_run_summary_processed_at ON apify_run_summary(processed_at);
CREATE INDEX idx_apify_run_summary_status ON apify_run_summary(status);

-- Step 5: Add auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_apify_run_summary_updated_at 
    BEFORE UPDATE ON apify_run_summary 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Grant permissions (uncomment if needed)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON apify_run_summary TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON apify_run_summary TO service_role;

-- Step 7: Verify the new table was created correctly
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'apify_run_summary'
ORDER BY ordinal_position;
