-- PostgreSQL function to handle venue coordinates with PostGIS geometry directly from edge function

-- Simple function to insert venue coordinates with PostGIS geometry
CREATE OR REPLACE FUNCTION insert_venue_coordinates_simple(
    p_venue_name TEXT,
    p_location_query TEXT,
    p_longitude DOUBLE PRECISION,
    p_latitude DOUBLE PRECISION,
    p_coordinates_text TEXT,
    p_mapbox_place_name TEXT DEFAULT NULL,
    p_geocoding_source TEXT DEFAULT 'mapbox'
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO venue_coordinates (
        venue_name,
        location_query,
        coordinates,
        coordinates_text,
        mapbox_place_name,
        geocoding_source,
        created_at,
        updated_at
    ) VALUES (
        p_venue_name,
        p_location_query,
        ST_Point(p_longitude, p_latitude), -- PostGIS geometry
        p_coordinates_text,
        p_mapbox_place_name,
        p_geocoding_source,
        NOW(),
        NOW()
    )
    ON CONFLICT (location_query) DO UPDATE SET
        coordinates = ST_Point(p_longitude, p_latitude),
        coordinates_text = p_coordinates_text,
        mapbox_place_name = p_mapbox_place_name,
        geocoding_source = p_geocoding_source,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION insert_venue_coordinates_simple IS 'Insert venue coordinates with PostGIS geometry from edge function, with upsert capability';
