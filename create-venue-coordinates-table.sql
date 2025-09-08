-- Create venue_coordinates table to cache geocoded venue locations
CREATE TABLE IF NOT EXISTS venue_coordinates (
    id SERIAL PRIMARY KEY,
    venue_name TEXT NOT NULL,
    location_query TEXT NOT NULL, -- The exact query used for geocoding
    coordinates GEOMETRY(POINT, 4326), -- PostGIS point geometry
    coordinates_text TEXT, -- Text representation: "POINT(lon lat)"
    mapbox_place_name TEXT, -- The place name returned by Mapbox
    confidence_score FLOAT, -- Mapbox confidence score if available
    -- Address components from apify_ticketmaster table
    address_country TEXT,
    address_locality TEXT,
    address_region TEXT,
    postal_code TEXT,
    street_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    geocoding_source TEXT DEFAULT 'mapbox', -- Track the source of geocoding
    
    -- Create unique constraint on location_query to prevent duplicates
    CONSTRAINT unique_location_query UNIQUE (location_query)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_venue_coordinates_venue_name ON venue_coordinates(venue_name);
CREATE INDEX IF NOT EXISTS idx_venue_coordinates_location_query ON venue_coordinates(location_query);
CREATE INDEX IF NOT EXISTS idx_venue_coordinates_coordinates ON venue_coordinates USING GIST(coordinates);

-- Add comments for documentation
COMMENT ON TABLE venue_coordinates IS 'Cache table for geocoded venue coordinates to reduce API calls';
COMMENT ON COLUMN venue_coordinates.venue_name IS 'Human readable venue name extracted from description after "|"';
COMMENT ON COLUMN venue_coordinates.location_query IS 'Exact query string used for geocoding (used as cache key)';
COMMENT ON COLUMN venue_coordinates.coordinates IS 'PostGIS point geometry in WGS84 (SRID 4326)';
COMMENT ON COLUMN venue_coordinates.coordinates_text IS 'Text representation for easy API consumption';
COMMENT ON COLUMN venue_coordinates.mapbox_place_name IS 'Canonical place name returned by geocoding service';
COMMENT ON COLUMN venue_coordinates.confidence_score IS 'Confidence score from geocoding service (0-1)';
COMMENT ON COLUMN venue_coordinates.address_country IS 'Country from event address';
COMMENT ON COLUMN venue_coordinates.address_locality IS 'City/locality from event address';
COMMENT ON COLUMN venue_coordinates.address_region IS 'State/region from event address';
COMMENT ON COLUMN venue_coordinates.postal_code IS 'Postal/zip code from event address';
COMMENT ON COLUMN venue_coordinates.street_address IS 'Street address from event address';
COMMENT ON COLUMN venue_coordinates.geocoding_source IS 'Source of geocoding data (mapbox, manual, etc)';

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_venue_coordinates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_venue_coordinates_updated_at ON venue_coordinates;
CREATE TRIGGER trigger_update_venue_coordinates_updated_at
    BEFORE UPDATE ON venue_coordinates
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_coordinates_updated_at();
