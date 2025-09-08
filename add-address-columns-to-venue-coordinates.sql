-- Migration script to add address columns to existing venue_coordinates table
-- Run this in Supabase SQL editor if the table already exists

-- Add address columns to venue_coordinates table
ALTER TABLE venue_coordinates 
ADD COLUMN IF NOT EXISTS address_country TEXT,
ADD COLUMN IF NOT EXISTS address_locality TEXT,
ADD COLUMN IF NOT EXISTS address_region TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS street_address TEXT;

-- Update comments for the new columns
COMMENT ON COLUMN venue_coordinates.venue_name IS 'Human readable venue name extracted from description after "|"';
COMMENT ON COLUMN venue_coordinates.address_country IS 'Country from event address';
COMMENT ON COLUMN venue_coordinates.address_locality IS 'City/locality from event address';
COMMENT ON COLUMN venue_coordinates.address_region IS 'State/region from event address';
COMMENT ON COLUMN venue_coordinates.postal_code IS 'Postal/zip code from event address';
COMMENT ON COLUMN venue_coordinates.street_address IS 'Street address from event address';

-- Create indexes for the new address columns
CREATE INDEX IF NOT EXISTS idx_venue_coordinates_address_locality ON venue_coordinates(address_locality);
CREATE INDEX IF NOT EXISTS idx_venue_coordinates_address_country ON venue_coordinates(address_country);
CREATE INDEX IF NOT EXISTS idx_venue_coordinates_address_region ON venue_coordinates(address_region);
