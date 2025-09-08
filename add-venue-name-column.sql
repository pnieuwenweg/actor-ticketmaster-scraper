-- Add venue_name column to apify_ticketmaster table
-- This column will store the extracted venue name from the description field

ALTER TABLE apify_ticketmaster 
ADD COLUMN IF NOT EXISTS venue_name TEXT;

-- Add a comment to explain the purpose of this column
COMMENT ON COLUMN apify_ticketmaster.venue_name IS 'Venue name extracted from description field (after last "|") or from venue.name/address_locality as fallback';

-- Create an index on venue_name for faster queries
CREATE INDEX IF NOT EXISTS idx_apify_ticketmaster_venue_name ON apify_ticketmaster(venue_name);

-- Update existing records with extracted venue names
-- This will be populated automatically for new imports
-- You can run this manually to backfill existing data if needed:

/*
UPDATE apify_ticketmaster 
SET venue_name = CASE
    -- Extract venue name from description after last "|"
    WHEN description IS NOT NULL AND description ~ '\|' THEN
        TRIM(SUBSTRING(description FROM '.*\|(.*)$'))
    -- Fallback to venue.name if available
    WHEN venue IS NOT NULL AND venue->>'name' IS NOT NULL THEN
        venue->>'name'
    -- Final fallback to address_locality
    WHEN address_locality IS NOT NULL THEN
        address_locality
    ELSE
        'Unknown venue'
END
WHERE venue_name IS NULL;
*/
