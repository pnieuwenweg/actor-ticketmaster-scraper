import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
const ACTOR_ID = Deno.env.get('TICKETMASTER_ACTOR_ID');
serve(async (req)=>{
  try {
    // Handle debug endpoint without authentication
    if (req.url.includes('?debug=env')) {
      return new Response(JSON.stringify({
        APIFY_TOKEN: APIFY_TOKEN ? 'SET' : 'NOT SET',
        ACTOR_ID: ACTOR_ID ? 'SET' : 'NOT SET',
        APIFY_TOKEN_VALUE: APIFY_TOKEN,
        ACTOR_ID_VALUE: ACTOR_ID,
        allEnvKeys: Object.keys(Deno.env.toObject())
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    // Debug environment variables - show full values for debugging
    console.log('Environment check:');
    console.log('APIFY_TOKEN:', APIFY_TOKEN || 'NOT SET');
    console.log('ACTOR_ID:', ACTOR_ID || 'NOT SET');
    console.log('All env vars:');
    console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL') ? 'Set' : 'NOT SET');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'Set' : 'NOT SET');
    // Check for missing environment variables
    if (!APIFY_TOKEN) {
      return new Response(JSON.stringify({
        error: 'APIFY_TOKEN environment variable is not set'
      }), {
        status: 500
      });
    }
    if (!ACTOR_ID) {
      return new Response(JSON.stringify({
        error: 'TICKETMASTER_ACTOR_ID environment variable is not set'
      }), {
        status: 500
      });
    }
    // Handle both JSON requests and simple GET/POST requests
    let action, payload = {};
    try {
      const body = await req.json();
      action = body.action;
      payload = {
        ...body
      };
      delete payload.action;
    } catch (error) {
      // If JSON parsing fails, default to import_latest_runs
      console.log('No JSON body provided, defaulting to import_latest_runs');
      action = undefined;
    }
    // Default to import_latest_runs if no action specified
    const actionToExecute = action || 'import_latest_runs';
    switch(actionToExecute){
      case 'import_latest_runs':
        return await importLatestRuns();
      case 'import_runs_by_date':
        return await importRunsByDate(payload.date);
      case 'import_specific_runs':
        return await importSpecificRuns(payload.runIds);
      case 'list_recent_runs':
        return await listRecentRuns(payload.days || 7);
      default:
        return new Response(JSON.stringify({
          error: 'Invalid action. Use: import_latest_runs, import_runs_by_date, import_specific_runs, or list_recent_runs'
        }), {
          status: 400
        });
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
});
// Helper function to import runs from the latest date
async function importLatestRuns() {
  try {
    console.log('Finding runs from the latest date...');
    console.log('Using ACTOR_ID:', ACTOR_ID);
    console.log('Using APIFY_TOKEN:', APIFY_TOKEN ? 'Set' : 'NOT SET');
    // Construct the URL
    const apiUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?desc=true&limit=100`;
    console.log('API URL:', apiUrl);
    // Get all runs sorted by date (most recent first)
    const runsResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`
      }
    });
    console.log('Response status:', runsResponse.status);
    console.log('Response statusText:', runsResponse.statusText);
    if (!runsResponse.ok) {
      // Get more details about the error
      const errorText = await runsResponse.text();
      console.log('Error response body:', errorText);
      throw new Error(`Failed to fetch runs: ${runsResponse.statusText} - ${errorText}`);
    }
    const { data: { items: allRuns } } = await runsResponse.json();
    if (allRuns.length === 0) {
      return new Response(JSON.stringify({
        message: 'No runs found',
        totalRuns: 0,
        runsProcessed: []
      }), {
        status: 200
      });
    }
    // Find the latest date among all runs
    const latestRun = allRuns[0] // Already sorted by date desc
    ;
    const latestDate = latestRun.startedAt.split('T')[0] // Get just the date part
    ;
    console.log(`Latest date found: ${latestDate}`);
    // Filter runs to only include those from the latest date
    const latestDateRuns = allRuns.filter((run)=>run.startedAt.startsWith(latestDate));
    console.log(`Found ${latestDateRuns.length} runs from ${latestDate}`);
    // Import all runs from the latest date
    return await importRunsList(latestDateRuns, `latest date (${latestDate})`);
  } catch (error) {
    console.error('Error importing latest runs:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
}
// Helper function to import a list of runs
async function importRunsList(runs, description) {
  try {
    console.log(`Starting import of ${runs.length} runs from ${description}`);
    // Check which runs have already been processed to avoid re-processing
    const runIds = runs.map((run)=>run.id);
    const { data: existingRuns, error: checkError } = await supabase.from('apify_ticketmaster').select('apify_run_id').in('apify_run_id', runIds);
    if (checkError) {
      console.warn('Could not check existing runs, proceeding with all runs:', checkError.message);
    }
    const processedRunIds = new Set(existingRuns?.map((r)=>r.apify_run_id) || []);
    const newRuns = runs.filter((run)=>!processedRunIds.has(run.id));
    const existingRunsToUpdate = runs.filter((run)=>processedRunIds.has(run.id));
    console.log(`📊 Run analysis:`);
    console.log(`  - ${newRuns.length} new runs to process`);
    console.log(`  - ${existingRunsToUpdate.length} runs already processed (will update)`);
    console.log(`  - ${runs.length} total runs`);
    console.log(`  - Processed run IDs:`, [
      ...processedRunIds
    ]);
    console.log(`  - Current run IDs:`, runIds);
    const runResults = [];
    // Process all runs, but with awareness of which have been processed before
    for (const run of runs){
      try {
        const isAlreadyProcessed = processedRunIds.has(run.id);
        console.log(`Processing run ${run.id} (${isAlreadyProcessed ? 'UPDATE' : 'NEW'})...`);
        const result = await importEventsFromRun(run.id, run.startedAt);
        runResults.push({
          runId: run.id,
          startedAt: run.startedAt,
          eventsImported: result.eventsImported,
          newEvents: result.newEvents || 0,
          updatedEvents: result.updatedEvents || 0,
          status: 'success',
          wasAlreadyProcessed: isAlreadyProcessed
        });
      } catch (error) {
        console.error(`Error importing run ${run.id}:`, error);
        runResults.push({
          runId: run.id,
          startedAt: run.startedAt,
          eventsImported: 0,
          newEvents: 0,
          updatedEvents: 0,
          status: 'error',
          error: error.message,
          wasAlreadyProcessed: processedRunIds.has(run.id)
        });
      }
    }
    const totalEventsImported = runResults.reduce((sum, result)=>sum + (result.eventsImported || 0), 0);
    const totalNewEvents = runResults.reduce((sum, result)=>sum + (result.newEvents || 0), 0);
    const totalUpdatedEvents = runResults.reduce((sum, result)=>sum + (result.updatedEvents || 0), 0);
    return new Response(JSON.stringify({
      message: `Import completed for ${description}`,
      totalRuns: runs.length,
      totalEventsImported,
      totalNewEvents,
      totalUpdatedEvents,
      runsProcessed: runResults
    }), {
      status: 200
    });
  } catch (error) {
    console.error(`Error in importRunsList:`, error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
}
// Helper function to import runs by specific date
async function importRunsByDate(targetDate) {
  try {
    console.log(`Fetching runs for date: ${targetDate}`);
    const runsResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?desc=true&limit=100`, {
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`
      }
    });
    if (!runsResponse.ok) {
      throw new Error(`Failed to fetch runs: ${runsResponse.statusText}`);
    }
    const { data: { items: allRuns } } = await runsResponse.json();
    // Filter runs by target date
    const targetRuns = allRuns.filter((run)=>run.startedAt.startsWith(targetDate));
    console.log(`Found ${targetRuns.length} runs for ${targetDate}`);
    return await importRunsList(targetRuns, `date ${targetDate}`);
  } catch (error) {
    console.error('Error importing runs by date:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
}
// Helper function to import specific runs by IDs
async function importSpecificRuns(runIds) {
  try {
    console.log(`Starting import of ${runIds.length} specific runs`);
    const runResults = [];
    for (const runId of runIds){
      try {
        const result = await importEventsFromRun(runId);
        runResults.push({
          runId: runId,
          eventsImported: result.eventsImported,
          newEvents: result.newEvents || 0,
          updatedEvents: result.updatedEvents || 0,
          status: 'success'
        });
      } catch (error) {
        console.error(`Error importing run ${runId}:`, error);
        runResults.push({
          runId: runId,
          eventsImported: 0,
          newEvents: 0,
          updatedEvents: 0,
          status: 'error',
          error: error.message
        });
      }
    }
    const totalEventsImported = runResults.reduce((sum, result)=>sum + (result.eventsImported || 0), 0);
    const totalNewEvents = runResults.reduce((sum, result)=>sum + (result.newEvents || 0), 0);
    const totalUpdatedEvents = runResults.reduce((sum, result)=>sum + (result.updatedEvents || 0), 0);
    return new Response(JSON.stringify({
      message: `Import completed for ${runIds.length} specific runs`,
      totalRuns: runIds.length,
      totalEventsImported,
      totalNewEvents,
      totalUpdatedEvents,
      runsProcessed: runResults
    }), {
      status: 200
    });
  } catch (error) {
    console.error('Error in importSpecificRuns:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500
    });
  }
}
// Helper function to list recent runs
async function listRecentRuns(days) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const runsResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?status=SUCCEEDED&limit=50`, {
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`
    }
  });
  if (!runsResponse.ok) {
    throw new Error(`Failed to fetch runs: ${runsResponse.statusText}`);
  }
  const runsData = await runsResponse.json();
  const recentRuns = runsData.data.items.filter((run)=>new Date(run.startedAt) >= sinceDate).map((run)=>({
      id: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      stats: run.stats,
      buildNumber: run.buildNumber
    }));
  return new Response(JSON.stringify({
    success: true,
    days: days,
    runsFound: recentRuns.length,
    runs: recentRuns
  }));
}
// Helper function to import events from a single run
async function importEventsFromRun(runId, runStartedAt = null) {
  console.log(`Importing events from run: ${runId}`);
  // First get the run details to find the dataset ID
  const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`
    }
  });
  if (!runResponse.ok) {
    throw new Error(`Failed to fetch run details for ${runId}: ${runResponse.statusText}`);
  }
  const runData = await runResponse.json();
  const datasetId = runData.data.defaultDatasetId;
  if (!datasetId) {
    console.log(`No dataset found for run ${runId}`);
    return {
      eventsImported: 0
    };
  }
  console.log(`Found dataset ID: ${datasetId} for run ${runId}`);
  // Now get events from the dataset
  const eventsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`
    }
  });
  if (!eventsResponse.ok) {
    throw new Error(`Failed to fetch events from dataset ${datasetId}: ${eventsResponse.statusText}`);
  }
  const rawEvents = await eventsResponse.json();
  console.log(`Got ${rawEvents.length} raw events from run ${runId}`);
  // Filter out unwanted events
  const filteredEvents = rawEvents.filter((event)=>{
    // Skip events with TBA
    if (event.name && event.name.toLowerCase().includes('tba')) {
      return false;
    }
    // Skip events with "Invalid date"
    if (event.date && event.date.toLowerCase().includes('invalid date')) {
      return false;
    }
    // Skip events with TBA in dateTitle
    if (event.dateTitle && event.dateTitle.toLowerCase().includes('tba')) {
      return false;
    }
    // Must have a name
    if (!event.name || event.name.trim() === '') {
      return false;
    }
    return true;
  });
  console.log(`Filtered to ${filteredEvents.length} valid events (removed ${rawEvents.length - filteredEvents.length} TBA/invalid events)`);
  if (filteredEvents.length === 0) {
    return {
      eventsImported: 0
    };
  }
  console.log(`Preparing ${filteredEvents.length} events for database upsert (insert/update)...`);
  console.log(`Sample event IDs will be logged for debugging...`);
  // Prepare events for database insertion
  const eventsToInsert = filteredEvents.map((event)=>{
    // Create a more consistent unique event ID by normalizing the components
    // Use the Ticketmaster ID if available, otherwise create a consistent composite key
    let eventId;
    if (event.id && typeof event.id === 'string' && event.id.trim() !== '') {
      // Use Ticketmaster's native ID if available
      eventId = event.id.trim();
    } else if (event.event_id && typeof event.event_id === 'string' && event.event_id.trim() !== '') {
      // Use event_id if available
      eventId = event.event_id.trim();
    } else {
      // Create a consistent composite key by normalizing the components
      const normalizedName = event.name?.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unknown';
      const normalizedVenue = event.venue?.name?.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') || event.addressLocality?.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') || 'unknown';
      const normalizedDate = event.date || event.dateTitle || 'unknown';
      eventId = `${normalizedName}-${normalizedVenue}-${normalizedDate}`.replace(/--+/g, '-');
    }
    // Parse date
    let parsedDate = null;
    if (event.date && event.date !== 'Invalid date') {
      parsedDate = new Date(event.date).toISOString();
    } else if (event.dateTitle && event.dateTitle !== 'Invalid date') {
      // Try to parse dateTitle (format like "Nov 14")
      const currentYear = new Date().getFullYear();
      const dateStr = `${event.dateTitle} ${currentYear}`;
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        parsedDate = parsed.toISOString();
      }
    }
    return {
      event_id: eventId,
      apify_run_id: runId,
      // Basic event info
      name: event.name,
      description: event.description || null,
      url: event.url || null,
      image: event.image || null,
      // Date fields
      date_time: parsedDate,
      date_title: event.dateTitle || null,
      date_sub_title: event.dateSubTitle || null,
      // Location fields
      address_country: event.addressCountry || null,
      address_locality: event.addressLocality || null,
      address_region: event.addressRegion || null,
      postal_code: event.postalCode || null,
      street_address: event.streetAddress || null,
      place_url: event.placeUrl || null,
      // Event classification
      genre_name: event.genreName || null,
      segment_name: event.segmentName || null,
      // Pricing and offers (always update these as they may change)
      price_ranges: event.priceRanges || null,
      offer: event.offer || null,
      // People/performers (may be updated with more details)
      performers: event.performers || null,
      // Original complex fields (for backwards compatibility)
      venue: event.venue || null,
      location: event.location || null,
      prices: event.prices || null,
      classifications: event.classifications || null,
      // Metadata - always update these to track latest import
      raw_data: event,
      imported_at: new Date().toISOString(),
      run_started_at: runStartedAt || new Date().toISOString()
    };
  });
  // Check for duplicate event IDs within this batch
  const eventIds = eventsToInsert.map((event)=>event.event_id);
  const uniqueEventIds = new Set(eventIds);
  if (eventIds.length !== uniqueEventIds.size) {
    const duplicates = eventIds.filter((id, index)=>eventIds.indexOf(id) !== index);
    console.warn(`⚠️  Found ${eventIds.length - uniqueEventIds.size} duplicate event IDs in this batch:`, [
      ...new Set(duplicates)
    ]);
  }
  console.log(`Generated ${uniqueEventIds.size} unique event IDs from ${eventsToInsert.length} events`);
  // Check which events already exist to track updates vs inserts
  console.log(`Checking for existing events among ${uniqueEventIds.size} event IDs...`);
  const { data: existingEvents, error: checkError } = await supabase.from('apify_ticketmaster').select('event_id').in('event_id', [
    ...uniqueEventIds
  ]);
  if (checkError) {
    console.warn('Could not check existing events, proceeding with upsert:', checkError.message);
  }
  const existingEventIds = new Set(existingEvents?.map((e)=>e.event_id) || []);
  console.log(`Found ${existingEventIds.size} existing events in database`);
  // Show some sample existing vs new event IDs for debugging
  if (existingEventIds.size > 0) {
    const sampleExisting = [
      ...existingEventIds
    ].slice(0, 3);
    console.log(`Sample existing event IDs:`, sampleExisting);
  }
  const newEvents = eventsToInsert.filter((event)=>!existingEventIds.has(event.event_id));
  const updateEvents = eventsToInsert.filter((event)=>existingEventIds.has(event.event_id));
  if (newEvents.length > 0) {
    const sampleNew = newEvents.slice(0, 3).map((e)=>e.event_id);
    console.log(`Sample new event IDs:`, sampleNew);
  }
  if (updateEvents.length > 0) {
    const sampleUpdate = updateEvents.slice(0, 3).map((e)=>e.event_id);
    console.log(`Sample update event IDs:`, sampleUpdate);
  }
  // Check if any new event IDs are suspicious (might be duplicates with different formats)
  if (newEvents.length > 0 && existingEventIds.size > 0) {
    console.log(`🔍 Debugging potential ID mismatch:`);
    console.log(`  Run ID: ${runId}`);
    console.log(`  New events found: ${newEvents.length}`);
    console.log(`  Expected: Most should be updates if run was already processed`);
  }
  console.log(`📊 Event analysis:`);
  console.log(`  - ${newEvents.length} new events to insert`);
  console.log(`  - ${updateEvents.length} existing events to update`);
  console.log(`  - ${eventsToInsert.length} total events to process`);
  // Insert into database with upsert to handle duplicates and updates
  const { data, error } = await supabase.from('apify_ticketmaster').upsert(eventsToInsert, {
    onConflict: 'event_id',
    ignoreDuplicates: false // This ensures updates happen
  }).select('event_id');
  if (error) {
    console.error('Database insert error:', error);
    throw new Error(`Failed to insert events: ${error.message}`);
  }
  console.log(`✅ Database operation completed successfully!`);
  console.log(`📊 Import summary for run ${runId}:`);
  console.log(`  - ${newEvents.length} new events inserted`);
  console.log(`  - ${updateEvents.length} existing events updated`);
  console.log(`  - ${eventsToInsert.length} total events processed`);
  console.log(`  - ${data?.length || eventsToInsert.length} database records affected`);
  return {
    eventsImported: eventsToInsert.length,
    newEvents: newEvents.length,
    updatedEvents: updateEvents.length
  };
}
