-- Create or recreate the apify_run_summary table with all required columns
-- This table tracks the processing status and results of Apify runs

-- Drop the view if it exists (since it exists as a view, not a table)
DROP VIEW IF EXISTS apify_run_summary;

-- Also drop the table if it exists (for safety)
DROP TABLE IF EXISTS apify_run_summary;

-- Create the table with all required columns
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

-- Create an index on run_started_at for better query performance
CREATE INDEX idx_apify_run_summary_run_started_at ON apify_run_summary(run_started_at);

-- Create an index on processed_at for better query performance
CREATE INDEX idx_apify_run_summary_processed_at ON apify_run_summary(processed_at);

-- Create an index on status for filtering
CREATE INDEX idx_apify_run_summary_status ON apify_run_summary(status);

-- Add a trigger to automatically update the updated_at timestamp
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

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON apify_run_summary TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON apify_run_summary TO service_role;
