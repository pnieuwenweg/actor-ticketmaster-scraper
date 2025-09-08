# Apify Ticketmaster Event Importer

This Supabase Edge Function automatically imports event data from Apify Ticketmaster scraper runs into a PostgreSQL database.

## Features

- **Latest Run Import**: Automatically fetches and imports only the latest date's runs
- **Duplicate Prevention**: Tracks processed runs to avoid re-importing the same data
- **Event Deduplication**: Uses consistent event ID generation to properly handle updates
- **Detailed Logging**: Shows counts of new vs updated events
- **Error Handling**: Robust error handling with detailed logging

## Environment Variables

Set these in your Supabase project settings under "Edge Functions":

```bash
APIFY_TOKEN=apify_api_your_token_here
TICKETMASTER_ACTOR_ID=BGrbhscS4lbqY6dyl
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
  "processedRunIds": ["run1", "run2", "run3"]
}
```

## Database Schema

The function expects a `events` table with the following structure:

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

-- Run tracking table
CREATE TABLE apify_runs_log (
  id serial PRIMARY KEY,
  run_id text UNIQUE NOT NULL,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  events_imported integer DEFAULT 0,
  processed_at timestamp with time zone DEFAULT now()
);
```

## Deployment

```bash
# Deploy the function
supabase functions deploy apify-importer

# Set environment variables
supabase secrets set APIFY_TOKEN=your_token_here
supabase secrets set TICKETMASTER_ACTOR_ID=BGrbhscS4lbqY6dyl
```
