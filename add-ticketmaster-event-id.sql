-- Add ticketmaster_event_id column to events table for linking imported Ticketmaster events
ALTER TABLE events ADD COLUMN IF NOT EXISTS ticketmaster_event_id TEXT;

-- Add index for performance when checking for existing events
CREATE INDEX IF NOT EXISTS idx_events_ticketmaster_event_id ON events(ticketmaster_event_id);

-- Comment on the column
COMMENT ON COLUMN events.ticketmaster_event_id IS 'Reference to the original Ticketmaster event ID from apify_ticketmaster table';
