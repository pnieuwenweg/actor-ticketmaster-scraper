-- First, let's see what the existing apify_run_summary view looks like
-- Run this to understand the current structure before dropping it

SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views 
WHERE viewname = 'apify_run_summary';

-- Also check what columns the view currently has
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'apify_run_summary'
ORDER BY ordinal_position;
