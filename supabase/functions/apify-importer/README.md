# Apify Ticketmaster Event Importer

This Supabase Edge Function automatically imports event data from Apify Ticketmaster scraper runs into both a specialized Ticketmaster events table and a general events table with geocoding.

## Features

- **Latest Run Import**: Automatically fetches and imports only the latest date's runs
- **Duplicate Prevention**: Tracks processed runs to avoid re-importing the same data
- **Event Deduplication**: Uses consistent event ID generation to properly handle updates
- **Dual Table Import**: Saves to both `events` (Ticketmaster-specific) and `general_events` (normalized) tables
- **Mapbox Geocoding**: Resolves venue locations to coordinates for mapping
- **Detailed Logging**: Shows counts of new vs updated events and geocoding calls
- **Error Handling**: Robust error handling with detailed logging

## Environment Variables

Set these in your Supabase project settings under "Edge Functions":

```bash
APIFY_TOKEN=apify_api_your_token_here
TICKETMASTER_ACTOR_ID=BGrbhscS4lbqY6dyl
MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Usage

### Default Action (Latest Runs)
```bash
# Imports all successful runs from the latest date
curl -X POST "https://your-project.supabase.co/functions/v1/apify-importer"
```

### Import Specific Run
```bash
# Imports a specific run by ID
curl -X POST "https://your-project.supabase.co/functions/v1/apify-importer?action=import_run&runId=your-run-id"
```

## Response Format

```json
{
  "message": "Successfully processed 3 runs from 2024-01-15",
  "date": "2024-01-15",
  "totalRuns": 3,
  "newEvents": 245,
  "updatedEvents": 12,
  "geocodingCalls": 187,
  "processedRunIds": ["run1", "run2", "run3"]
}
```

## Database Schema

The function expects these tables:

### Ticketmaster Events Table (`events`)
```sql
CREATE TABLE events (
  id text PRIMARY KEY,
  ticketmaster_id text,
  name text,
  type text,
  test boolean DEFAULT false,
  url text,
  locale text,
  images jsonb,
  distance numeric,
  units text,
  sales jsonb,
  dates jsonb,
  classifications jsonb,
  outlet_id text,
  venue_id text,
  attractions jsonb,
  price_ranges jsonb,
  products jsonb,
  seat_map jsonb,
  accessibility jsonb,
  ticket_limit jsonb,
  age_restrictions jsonb,
  code text,
  please_note text,
  info text,
  promoter jsonb,
  promoters jsonb,
  social jsonb,
  box_office_info jsonb,
  general_info jsonb,
  external_links jsonb,
  version text,
  updated_at timestamp with time zone DEFAULT now(),
  raw_event_data jsonb,
  apify_run_id text
);
```

### General Events Table (`general_events`)
```sql
CREATE TABLE general_events (
  event_id text PRIMARY KEY,
  title text,
  description text,
  website_url text,
  location geometry(Point, 4326), -- PostGIS geometry for coordinates
  location_name text,
  event_start_date date,
  event_end_date date,
  event_start_time time,
  event_end_time time,
  created_at timestamp with time zone DEFAULT now(),
  banner_url text,
  auto_import boolean DEFAULT false,
  ticketmaster_id text,
  raw_event_data jsonb
);
```

### Run Tracking Table
```sql
CREATE TABLE apify_runs_log (
  id serial PRIMARY KEY,
  run_id text UNIQUE NOT NULL,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  events_imported integer DEFAULT 0,
  processed_at timestamp with time zone DEFAULT now()
);
```

## Key Enhancements

1. **Dual Database Storage**: Events are saved to both specialized Ticketmaster table and normalized general events table
2. **Mapbox Geocoding**: Venue addresses are geocoded to PostGIS POINT geometries for mapping
3. **UUID Generation**: Each general event gets a unique UUID for consistent referencing
4. **Enhanced Data Mapping**: Ticketmaster data is intelligently mapped to general event schema
5. **Image Processing**: Banner images are selected from available event images
6. **Date/Time Parsing**: Proper parsing of Ticketmaster date and time formats
7. **Service Role Access**: Uses service role key for enhanced database permissions

## Deployment

```bash
# Deploy the function
supabase functions deploy apify-importer

# Set all environment variables
supabase secrets set APIFY_TOKEN=your_token_here
supabase secrets set TICKETMASTER_ACTOR_ID=BGrbhscS4lbqY6dyl
supabase secrets set MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```