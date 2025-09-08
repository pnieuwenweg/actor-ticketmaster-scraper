import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Function to generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}
// Function to extract venue name from description field
function extractVenueName(eventData) {
  // Try to extract venue name from description field after the LAST "|"
  if (eventData.description && typeof eventData.description === 'string') {
    const parts = eventData.description.split('|');
    if (parts.length > 1) {
      // Get the text after the last pipeline
      const venuePart = parts[parts.length - 1].trim();
      if (venuePart) {
        console.log(`🏢 Extracted venue name from description (after last |): "${venuePart}"`);
        return venuePart;
      }
    }
  }
  // Fallback to venue.name if available
  if (eventData.venue?.name) {
    console.log(`🏢 Using venue.name as fallback: "${eventData.venue.name}"`);
    return eventData.venue.name;
  }
  // Final fallback to address_locality
  if (eventData.address_locality) {
    console.log(`🏢 Using address_locality as final fallback: "${eventData.address_locality}"`);
    return eventData.address_locality;
  }
  console.log(`⚠️ Could not extract venue name from event data`);
  return 'Unknown venue';
}
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN');
const ACTOR_ID = Deno.env.get('TICKETMASTER_ACTOR_ID');
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
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
      error: error?.message || String(error) || 'Unknown error occurred'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
// Function to get location geometry using Mapbox with venue caching
async function getLocationGeometry(locationName, eventData) {
  try {
    console.log(`🗺️  Starting geocoding for: "${locationName}"`);
    // First, check if we already have this location in our cache
    console.log(`💾 Checking venue_coordinates cache for: "${locationName}"`);
    try {
      const { data: cachedVenue, error: cacheError } = await supabase.from('venue_coordinates').select('coordinates, coordinates_text, mapbox_place_name, created_at, geocoding_source').eq('location_query', locationName.trim()).single();
      if (cacheError && cacheError?.code !== 'PGRST116') {
        console.warn(`⚠️  Cache lookup error (continuing with API call):`, cacheError);
      } else if (cachedVenue && (cachedVenue.coordinates_text || cachedVenue.coordinates)) {
        console.log(`🎯 CACHE HIT! Found coordinates for "${locationName}":`);
        console.log(`   📍 Cached coordinates (text): ${cachedVenue.coordinates_text || 'Not available'}`);
        console.log(`   📍 Cached coordinates (geometry): ${cachedVenue.coordinates ? 'Available' : 'Not available'}`);
        console.log(`   🏷️  Cached place name: ${cachedVenue.mapbox_place_name || 'Unknown'}`);
        console.log(`   📅 Cached on: ${cachedVenue.created_at}`);
        console.log(`   🔧 Source: ${cachedVenue.geocoding_source}`);
        console.log(`   💰 Mapbox API call SAVED!`);
        // Return text format for compatibility (or convert from geometry if needed)
        return cachedVenue.coordinates_text || cachedVenue.coordinates;
      } else {
        console.log(`💾 Cache miss - no coordinates found for "${locationName}"`);
      }
    } catch (cacheError) {
      console.warn(`⚠️  Cache lookup failed (continuing with API call):`, cacheError);
    }
    // If not in cache, proceed with Mapbox API call
    const accessToken = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!accessToken) {
      console.warn('MAPBOX_ACCESS_TOKEN not found, skipping geocoding');
      return null;
    }
    let finalResult = null;
    let mapboxPlaceName = null;
    for(let attempt = 1; attempt <= 3; attempt++){
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationName)}.json?access_token=${accessToken}`;
        console.log(`🔍 Geocoding attempt ${attempt}/3: ${url.substring(0, 100)}...`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          console.log(`✅ Mapbox API response: ${data.features?.length || 0} features found`);
          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const [lon, lat] = feature.center;
            mapboxPlaceName = feature.place_name || 'Unknown place';
            finalResult = `POINT(${lon} ${lat})`;
            console.log(`🎯 Geocoding SUCCESS for "${locationName}":`);
            console.log(`   📍 Coordinates: ${lon}, ${lat}`);
            console.log(`   🏷️  Place name: ${mapboxPlaceName}`);
            console.log(`   📐 PostGIS format: ${finalResult}`);
            break; // Success, exit retry loop
          } else {
            console.log(`⚠️  No features found in Mapbox response for "${locationName}"`);
          }
        } else {
          console.error(`❌ Mapbox API error: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          console.error(`❌ Error response body: ${errorText}`);
        }
        // If no results, try with simplified location name
        if (attempt === 1 && locationName.includes(',')) {
          const parts = locationName.split(',');
          if (parts.length > 1) {
            const simplifiedLocation = parts[0].trim();
            console.log(`🔄 Trying simplified location: "${simplifiedLocation}" (from "${locationName}")`);
            const simplifiedUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(simplifiedLocation)}.json?access_token=${accessToken}`;
            const simplifiedResponse = await fetch(simplifiedUrl);
            if (simplifiedResponse.ok) {
              const simplifiedData = await simplifiedResponse.json();
              console.log(`✅ Simplified geocoding response: ${simplifiedData.features?.length || 0} features found`);
              if (simplifiedData.features && simplifiedData.features.length > 0) {
                const feature = simplifiedData.features[0];
                const [lon, lat] = feature.center;
                mapboxPlaceName = feature.place_name || 'Unknown place';
                finalResult = `POINT(${lon} ${lat})`;
                console.log(`🎯 Simplified geocoding SUCCESS for "${simplifiedLocation}":`);
                console.log(`   📍 Coordinates: ${lon}, ${lat}`);
                console.log(`   🏷️  Place name: ${mapboxPlaceName}`);
                console.log(`   📐 PostGIS format: ${finalResult}`);
                break; // Success, exit retry loop
              } else {
                console.log(`⚠️  No features found in simplified geocoding for "${simplifiedLocation}"`);
              }
            } else {
              console.error(`❌ Simplified geocoding error: ${simplifiedResponse.status} ${simplifiedResponse.statusText}`);
              const errorText = await simplifiedResponse.text();
              console.error(`❌ Simplified error response: ${errorText}`);
            }
          }
        }
        // If we reach here without success, continue to next attempt
        if (attempt < 3) {
          const delay = 1000 * attempt;
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise((resolve)=>setTimeout(resolve, delay));
        }
      } catch (error) {
        console.error(`❌ Geocoding attempt ${attempt} failed for "${locationName}":`, error);
        console.error('❌ Error details:', {
          name: error?.name || 'Unknown',
          message: error?.message || 'No message',
          stack: error?.stack?.substring(0, 200) || 'No stack trace'
        });
        if (attempt < 3) {
          const delay = 1000 * attempt; // Progressive delay: 1s, 2s
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise((resolve)=>setTimeout(resolve, delay));
        }
      }
    }
    // Cache the result (whether successful or failed)
    try {
      if (finalResult) {
        console.log(`💾 Caching successful geocoding result for "${locationName}"`);
        // Extract venue name from event description (after "|") or fallback
        const venueName = extractVenueName(eventData);
        // Parse coordinates from POINT(lon lat) format
        const coordMatch = finalResult.match(/POINT\(([^)]+)\)/);
        if (coordMatch) {
          const [lon, lat] = coordMatch[1].split(' ').map(Number);
          if (!isNaN(lon) && !isNaN(lat)) {
            console.log(`📐 Inserting with PostGIS geometry: POINT(${lon} ${lat})`);
            // Insert with PostGIS geometry directly, same as festival importer
            try {
              const { error: cacheInsertError } = await supabase.from('venue_coordinates').upsert({
                venue_name: venueName,
                location_query: locationName.trim(),
                coordinates: `POINT(${lon} ${lat})`,
                coordinates_text: finalResult,
                mapbox_place_name: mapboxPlaceName,
                geocoding_source: 'mapbox',
                // Add address information from event data
                address_country: eventData.address_country || null,
                address_locality: eventData.address_locality || null,
                address_region: eventData.address_region || null,
                postal_code: eventData.postal_code || null,
                street_address: eventData.street_address || null
              }, {
                onConflict: 'location_query'
              });
              if (cacheInsertError) {
                console.warn(`⚠️  Failed to cache geocoding result:`, cacheInsertError);
              } else {
                console.log(`✅ Successfully cached coordinates for "${locationName}" with PostGIS geometry`);
              }
            } catch (insertError) {
              console.warn(`⚠️  Cache insert failed:`, insertError);
            }
          } else {
            console.warn(`⚠️  Invalid coordinates parsed: ${coordMatch[1]}`);
          }
        } else {
          console.warn(`⚠️  Could not parse coordinates from: ${finalResult}`);
        }
      } else {
        console.log(`💾 Caching failed geocoding attempt for "${locationName}"`);
        // Cache the failure to avoid repeated API calls for the same bad location
        const venueName = extractVenueName(eventData);
        const { error: cacheInsertError } = await supabase.from('venue_coordinates').insert({
          venue_name: venueName,
          location_query: locationName.trim(),
          coordinates_text: null,
          coordinates: null,
          mapbox_place_name: null,
          geocoding_source: 'mapbox_failed',
          // Add address information from event data
          address_country: eventData.address_country || null,
          address_locality: eventData.address_locality || null,
          address_region: eventData.address_region || null,
          postal_code: eventData.postal_code || null,
          street_address: eventData.street_address || null
        });
        if (cacheInsertError && cacheInsertError?.code !== '23505') {
          console.warn(`⚠️  Failed to cache failed geocoding result:`, cacheInsertError);
        } else {
          console.log(`✅ Cached failed geocoding attempt for "${locationName}" to avoid future API calls`);
        }
      }
    } catch (cacheError) {
      console.warn(`⚠️  Error while caching geocoding result:`, cacheError);
    }
    if (!finalResult) {
      console.log(`❌ All geocoding attempts failed for "${locationName}"`);
    }
    return finalResult;
  } catch (error) {
    console.error(`❌ Fatal error getting coordinates for "${locationName}":`, error);
    console.error(`❌ Fatal error details:`, {
      name: error?.name || 'Unknown',
      message: error?.message || 'No message',
      stack: error?.stack?.substring(0, 200) || 'No stack trace'
    });
    return null;
  }
}
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
    // Show all available runs with their dates and event counts
    console.log(`📊 Found ${allRuns.length} total runs. Analyzing all recent runs...`);
    for(let i = 0; i < Math.min(15, allRuns.length); i++){
      const run = allRuns[i];
      const runDate = run.startedAt.split('T')[0];
      const runTime = run.startedAt.split('T')[1];
      console.log(`  Run ${i + 1}: ${run.id} - Date: ${runDate} ${runTime} - Status: ${run.status} - Finished: ${run.finishedAt ? 'Yes' : 'No'}`);
    }
    // Find the latest date among all runs
    const latestRun = allRuns[0] // Already sorted by date desc
    ;
    const latestDate = latestRun.startedAt.split('T')[0] // Get just the date part
    ;
    console.log(`Latest date found: ${latestDate}`);
    // Filter runs to include ALL runs from the latest date (not just successful ones)
    const latestDateRuns = allRuns.filter((run)=>{
      const runDate = run.startedAt.split('T')[0];
      return runDate === latestDate;
    });
    console.log(`📅 Found ${latestDateRuns.length} runs from latest date: ${latestDate}`);
    // Show details of all runs from the latest date
    latestDateRuns.forEach((run, index)=>{
      console.log(`  Latest date run ${index + 1}: ${run.id} - Status: ${run.status} - Started: ${run.startedAt} - Finished: ${run.finishedAt || 'N/A'}`);
    });
    // Use only the latest date runs (not yesterday)
    const recentRuns = latestDateRuns;
    // Group by date for better logging
    const runsByDate = recentRuns.reduce((acc, run)=>{
      const date = run.startedAt.split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(run);
      return acc;
    }, {});
    Object.entries(runsByDate).forEach(([date, runs])=>{
      console.log(`  ${date}: ${runs.length} runs`);
    });
    // Import all runs from the latest date
    return await importRunsList(recentRuns, `latest date (${latestDate})`);
  } catch (error) {
    console.error('Error importing latest runs:', error);
    return new Response(JSON.stringify({
      error: error?.message || String(error) || 'Unknown error occurred'
    }), {
      status: 500
    });
  }
}
// Helper function to import a list of runs
async function importRunsList(runs, description) {
  try {
    console.log(`Starting import of ${runs.length} runs from ${description}`);
    // Sort runs by number of events (smallest first) to process easier ones first
    console.log(`📊 Analyzing runs before processing...`);
    const runsWithStats = [];
    for (const run of runs){
      try {
        // Quick check to estimate run size without full processing
        const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}`, {
          headers: {
            'Authorization': `Bearer ${APIFY_TOKEN}`
          }
        });
        if (runResponse.ok) {
          const runData = await runResponse.json();
          const stats = runData.data.stats || {};
          runsWithStats.push({
            ...run,
            estimatedEvents: stats.outputItems || 0
          });
        } else {
          runsWithStats.push({
            ...run,
            estimatedEvents: 0
          });
        }
      } catch (error) {
        console.warn(`Could not get stats for run ${run.id}:`, error);
        runsWithStats.push({
          ...run,
          estimatedEvents: 0
        });
      }
    }
    // Sort by estimated events (smallest first)
    runsWithStats.sort((a, b)=>a.estimatedEvents - b.estimatedEvents);
    console.log(`📊 Run processing order (smallest to largest):`);
    runsWithStats.forEach((run, index)=>{
      console.log(`  ${index + 1}. Run ${run.id}: ~${run.estimatedEvents} events`);
    });
    // Check which runs have already been processed to avoid re-processing
    const runIds = runsWithStats.map((run)=>run.id);
    const { data: existingRuns, error: checkError } = await supabase.from('apify_ticketmaster').select('apify_run_id').in('apify_run_id', runIds);
    if (checkError) {
      console.warn('Could not check existing runs, proceeding with all runs:', checkError?.message || String(checkError) || 'Unknown error');
    }
    const processedRunIds = new Set(existingRuns?.map((r)=>r.apify_run_id) || []);
    const newRuns = runsWithStats.filter((run)=>!processedRunIds.has(run.id));
    const existingRunsToUpdate = runsWithStats.filter((run)=>processedRunIds.has(run.id));
    console.log(`📊 Run analysis:`);
    console.log(`  - ${newRuns.length} new runs to process`);
    console.log(`  - ${existingRunsToUpdate.length} runs already processed (will update)`);
    console.log(`  - ${runsWithStats.length} total runs`);
    console.log(`  - Processed run IDs:`, [
      ...processedRunIds
    ]);
    console.log(`  - Current run IDs:`, runIds);
    const runResults = [];
    const startTime = Date.now();
    const maxExecutionTime = 280000; // 280 seconds to stay under the 300s limit
    // Process all runs, but with awareness of which have been processed before
    for (const run of runsWithStats){
      try {
        const currentTime = Date.now();
        const elapsedTime = currentTime - startTime;
        if (elapsedTime > maxExecutionTime) {
          console.warn(`⏰ Approaching time limit (${elapsedTime}ms), stopping processing`);
          console.warn(`⏰ Remaining runs will need to be processed in a separate invocation`);
          break;
        }
        const isAlreadyProcessed = processedRunIds.has(run.id);
        console.log(`Processing run ${run.id} (${isAlreadyProcessed ? 'UPDATE' : 'NEW'}) - Estimated: ${run.estimatedEvents} events...`);
        console.log(`⏰ Time elapsed: ${Math.round(elapsedTime / 1000)}s / ${Math.round(maxExecutionTime / 1000)}s`);
        const result = await importEventsFromRun(run.id, run.startedAt);
        runResults.push({
          runId: run.id,
          startedAt: run.startedAt,
          eventsImported: result.eventsImported,
          newEvents: result.newEvents || 0,
          updatedEvents: result.updatedEvents || 0,
          status: 'success',
          wasAlreadyProcessed: isAlreadyProcessed,
          estimatedEvents: run.estimatedEvents,
          actualEvents: result.eventsImported
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
          error: error?.message || String(error) || 'Unknown error occurred',
          wasAlreadyProcessed: processedRunIds.has(run.id),
          estimatedEvents: run.estimatedEvents,
          actualEvents: 0
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
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error(`Error in importRunsList:`, error);
    return new Response(JSON.stringify({
      error: error?.message || String(error) || 'Unknown error occurred'
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
      error: error?.message || String(error) || 'Unknown error occurred'
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
          error: error?.message || String(error) || 'Unknown error occurred'
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
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in importSpecificRuns:', error);
    return new Response(JSON.stringify({
      error: error?.message || String(error) || 'Unknown error occurred'
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
// Helper function to import events from a single run - THREE PHASE APPROACH
async function importEventsFromRun(runId, runStartedAt = null) {
  console.log(`🚀 Starting 3-phase import for run: ${runId}`);
  console.log(`📋 Phase 1: Fetch from Apify and store in apify_ticketmaster table`);
  console.log(`📋 Phase 2: Geocode addresses with Mapbox and cache coordinates`);
  console.log(`📋 Phase 3: Copy events to main events table`);
  console.log('');
  // ========================================
  // PHASE 1: FETCH APIFY DATA AND STORE
  // ========================================
  console.log(`📥 PHASE 1: Fetching Apify run data and storing in apify_ticketmaster...`);
  const phase1Result = await fetchAndStoreApifyData(runId, runStartedAt);
  if (phase1Result.error) {
    console.error(`❌ Phase 1 failed:`, phase1Result.error);
    throw new Error(`Phase 1 failed: ${phase1Result.error}`);
  }
  console.log(`✅ Phase 1 completed: ${phase1Result.eventsStored} events stored in apify_ticketmaster`);
  console.log('');
  // ========================================
  // PHASE 2: GEOCODING WITH MAPBOX
  // ========================================
  console.log(`🗺️  PHASE 2: Geocoding addresses and caching coordinates...`);
  const phase2Result = await geocodeStoredEvents(runId);
  if (phase2Result.error) {
    console.warn(`⚠️  Phase 2 had issues:`, phase2Result.error);
  // Don't throw - continue to phase 3 even if geocoding fails
  }
  console.log(`✅ Phase 2 completed: ${phase2Result.geocodedCount} locations processed, ${phase2Result.successCount} successful`);
  console.log('');
  // ========================================
  // PHASE 3: COPY TO MAIN EVENTS TABLE
  // ========================================
  console.log(`📋 PHASE 3: Copying events to main events table...`);
  const phase3Result = await copyToMainEventsTable(runId);
  if (phase3Result.error) {
    console.error(`❌ Phase 3 failed:`, phase3Result.error);
    throw new Error(`Phase 3 failed: ${phase3Result.error}`);
  }
  console.log(`✅ Phase 3 completed: ${phase3Result.eventsInserted} events copied to main table`);
  console.log('');
  // ========================================
  // FINAL SUMMARY
  // ========================================
  console.log(`🎉 THREE-PHASE IMPORT COMPLETED for run ${runId}:`);
  console.log(`  📥 Phase 1: ${phase1Result.eventsStored} events stored in apify_ticketmaster`);
  console.log(`  🗺️  Phase 2: ${phase2Result.successCount}/${phase2Result.geocodedCount} locations geocoded`);
  console.log(`  📋 Phase 3: ${phase3Result.eventsInserted} events in main table`);
  return {
    eventsImported: phase1Result.eventsStored,
    newEvents: phase1Result.newEvents || 0,
    updatedEvents: phase1Result.updatedEvents || 0,
    mainTableInserts: phase3Result.eventsInserted,
    geocodingCalls: phase2Result.geocodedCount,
    geocodingSuccessful: phase2Result.successCount
  };
}
// ========================================
// PHASE 1: FETCH AND STORE APIFY DATA
// ========================================
async function fetchAndStoreApifyData(runId, runStartedAt = null) {
  try {
    console.log(`📥 Fetching run details for ${runId}...`);
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
        eventsStored: 0,
        newEvents: 0,
        updatedEvents: 0
      };
    }
    console.log(`📦 Found dataset ID: ${datasetId} for run ${runId}`);
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
    console.log(`📊 Got ${rawEvents.length} raw events from run ${runId}`);
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
    console.log(`🔍 Filtered to ${filteredEvents.length} valid events (removed ${rawEvents.length - filteredEvents.length} TBA/invalid events)`);
    if (filteredEvents.length === 0) {
      return {
        eventsStored: 0,
        newEvents: 0,
        updatedEvents: 0
      };
    }
    console.log(`📝 Preparing ${filteredEvents.length} events for database upsert...`);
    // Prepare events for database insertion
    const eventsToInsert = filteredEvents.map((event)=>{
      // Create a more consistent unique event ID by normalizing the components
      let eventId;
      if (event.id && typeof event.id === 'string' && event.id.trim() !== '') {
        eventId = event.id.trim();
      } else if (event.event_id && typeof event.event_id === 'string' && event.event_id.trim() !== '') {
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
      // Extract venue name from description or use fallback
      const extractedVenueName = extractVenueName(event);

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
        venue: extractedVenueName,
        location: event.location || null,
        prices: event.prices || null,
        classifications: event.classifications || null,
        // Metadata - always update these to track latest import
        raw_data: event,
        imported_at: new Date().toISOString(),
        run_started_at: runStartedAt || new Date().toISOString()
      };
    });
    // Check which events already exist to track updates vs inserts
    console.log(`🔍 Checking for existing events...`);
    const eventIds = eventsToInsert.map((event)=>event.event_id);
    const uniqueEventIds = new Set(eventIds);
    const { data: existingEvents, error: checkError } = await supabase.from('apify_ticketmaster').select('event_id').in('event_id', [
      ...uniqueEventIds
    ]);
    if (checkError) {
      console.warn('Could not check existing events, proceeding with upsert:', checkError?.message || String(checkError) || 'Unknown error');
    }
    const existingEventIds = new Set(existingEvents?.map((e)=>e.event_id) || []);
    const newEvents = eventsToInsert.filter((event)=>!existingEventIds.has(event.event_id));
    const updateEvents = eventsToInsert.filter((event)=>existingEventIds.has(event.event_id));
    console.log(`📊 Event analysis for apify_ticketmaster:`);
    console.log(`  - ${newEvents.length} new events to insert`);
    console.log(`  - ${updateEvents.length} existing events to update`);
    console.log(`  - ${eventsToInsert.length} total events to process`);
    // Insert into database with upsert to handle duplicates and updates
    const { data, error } = await supabase.from('apify_ticketmaster').upsert(eventsToInsert, {
      onConflict: 'event_id',
      ignoreDuplicates: false
    }).select('event_id');
    if (error) {
      console.error('❌ Database insert error:', error);
      throw new Error(`Failed to insert events: ${error?.message || String(error) || 'Unknown database error'}`);
    }
    console.log(`✅ Phase 1 completed successfully: ${data?.length || eventsToInsert.length} records in apify_ticketmaster`);
    return {
      eventsStored: eventsToInsert.length,
      newEvents: newEvents.length,
      updatedEvents: updateEvents.length
    };
  } catch (error) {
    console.error('❌ Phase 1 error:', error);
    return {
      error: error?.message || String(error) || 'Unknown error in Phase 1',
      eventsStored: 0,
      newEvents: 0,
      updatedEvents: 0
    };
  }
}
// ========================================
// PHASE 2: GEOCODE STORED EVENTS
// ========================================
async function geocodeStoredEvents(runId) {
  try {
    console.log(`🗺️  Getting events from apify_ticketmaster for run ${runId}...`);
    // Get events from the run that need geocoding
    const { data: storedEvents, error: fetchError } = await supabase.from('apify_ticketmaster').select('event_id, street_address, address_locality, address_region, postal_code, address_country, description').eq('apify_run_id', runId);
    if (fetchError) {
      throw new Error(`Failed to fetch stored events: ${fetchError.message}`);
    }
    if (!storedEvents || storedEvents.length === 0) {
      console.log(`No events found for run ${runId}`);
      return {
        geocodedCount: 0,
        successCount: 0
      };
    }
    console.log(`📦 Found ${storedEvents.length} events to geocode`);
    let geocodedCount = 0;
    let successCount = 0;
    let skippedCount = 0;
    // Build unique location strings to avoid duplicate geocoding
    const uniqueLocations = new Map();
    for (const event of storedEvents){
      // Build address-based location string for geocoding
      const addressParts = [];
      // Add street address first (most specific)
      if (event.street_address && event.street_address.trim()) {
        addressParts.push(event.street_address.trim());
      }
      // Add locality (city)
      if (event.address_locality && event.address_locality.trim()) {
        addressParts.push(event.address_locality.trim());
      }
      // Add postal code for better precision
      if (event.postal_code && event.postal_code.trim()) {
        addressParts.push(event.postal_code.trim());
      }
      // Add region/state
      if (event.address_region && event.address_region.trim()) {
        addressParts.push(event.address_region.trim());
      }
      // Add country
      if (event.address_country && event.address_country.trim()) {
        addressParts.push(event.address_country.trim());
      }
      // Combine address parts
      let locationName = addressParts.join(', ');
      // Fallback to venue name if no address components available
      if (!locationName) {
        const venueName = extractVenueName(event);
        if (venueName !== 'Unknown venue') {
          locationName = venueName;
          if (event.address_locality) {
            locationName += `, ${event.address_locality}`;
          }
        }
      }
      if (locationName.trim()) {
        if (!uniqueLocations.has(locationName)) {
          uniqueLocations.set(locationName, []);
        }
        uniqueLocations.get(locationName).push(event);
      }
    }
    console.log(`� Found ${uniqueLocations.size} unique locations to geocode (from ${storedEvents.length} events)`);
    for (const [locationName, events] of uniqueLocations){
      try {
        console.log(`🗺️  Geocoding location: "${locationName}" (${events.length} events)`);
        // Use the existing getLocationGeometry function with first event as sample
        const coordinates = await getLocationGeometry(locationName, events[0]);
        geocodedCount++;
        if (coordinates) {
          successCount++;
          console.log(`✅ Successfully geocoded: ${locationName} (affects ${events.length} events)`);
        } else {
          console.log(`❌ Failed to geocode: ${locationName} (affects ${events.length} events)`);
        }
        // Reduced delay to speed up processing
        await new Promise((resolve)=>setTimeout(resolve, 50));
      } catch (error) {
        console.error(`❌ Error geocoding location ${locationName}:`, error);
      }
    }
    console.log(`✅ Phase 2 completed: ${successCount}/${geocodedCount} unique locations geocoded successfully`);
    console.log(`📊 This affected ${storedEvents.length} total events`);
    return {
      geocodedCount: storedEvents.length,
      successCount: successCount * (storedEvents.length / geocodedCount) // Estimate successful events
    };
  } catch (error) {
    console.error('❌ Phase 2 error:', error);
    return {
      error: error?.message || String(error) || 'Unknown error in Phase 2',
      geocodedCount: 0,
      successCount: 0
    };
  }
}
// ========================================
// PHASE 3: COPY TO MAIN EVENTS TABLE
// ========================================
async function copyToMainEventsTable(runId) {
  try {
    console.log(`📋 Getting events from apify_ticketmaster for run ${runId}...`);
    // Get all events from the run
    const { data: storedEvents, error: fetchError } = await supabase.from('apify_ticketmaster').select('*').eq('apify_run_id', runId);
    if (fetchError) {
      throw new Error(`Failed to fetch stored events: ${fetchError.message}`);
    }
    if (!storedEvents || storedEvents.length === 0) {
      console.log(`No events found for run ${runId}`);
      return {
        eventsInserted: 0
      };
    }
    console.log(`📦 Found ${storedEvents.length} events to copy to main table`);
    // Check which events already exist in main table
    const ticketmasterEventIds = storedEvents.map((e)=>e.event_id);
    const { data: existingMainEvents, error: mainTableCheckError } = await supabase.from('events').select('ticketmaster_event_id').in('ticketmaster_event_id', ticketmasterEventIds);
    if (mainTableCheckError) {
      console.warn(`⚠️  Could not check existing events in main table:`, mainTableCheckError?.message || String(mainTableCheckError) || 'Unknown error');
    }
    const existingTicketmasterIds = new Set(existingMainEvents?.map((e)=>e.ticketmaster_event_id) || []);
    // Filter to only process events that don't exist in main table yet
    const eventsToProcess = storedEvents.filter((event)=>!existingTicketmasterIds.has(event.event_id));
    console.log(`📊 Main table analysis:`);
    console.log(`  - ${eventsToProcess.length} new events to insert`);
    console.log(`  - ${storedEvents.length - eventsToProcess.length} events already exist (skipping)`);
    if (eventsToProcess.length === 0) {
      console.log(`ℹ️  No new events to insert into main table`);
      return {
        eventsInserted: 0
      };
    }
    console.log(`📝 Preparing ${eventsToProcess.length} events for main events table...`);
    const eventsForMainTable = [];
    for (const event of eventsToProcess){
      try {
        // Generate unique event ID for main table
        const mainEventId = generateUUID();
        // Build address-based location name
        const addressParts = [];
        if (event.street_address && event.street_address.trim()) {
          addressParts.push(event.street_address.trim());
        }
        if (event.address_locality && event.address_locality.trim()) {
          addressParts.push(event.address_locality.trim());
        }
        if (event.postal_code && event.postal_code.trim()) {
          addressParts.push(event.postal_code.trim());
        }
        if (event.address_region && event.address_region.trim()) {
          addressParts.push(event.address_region.trim());
        }
        if (event.address_country && event.address_country.trim()) {
          addressParts.push(event.address_country.trim());
        }
        let locationName = addressParts.join(', ');
        // Fallback to venue name if no address
        if (!locationName) {
          const venueName = extractVenueName(event);
          locationName = venueName;
          if (event.address_locality && venueName !== 'Unknown venue') {
            locationName += `, ${event.address_locality}`;
          }
        }
        // Try to get cached coordinates
        let locationGeometry = null;
        if (locationName.trim()) {
          try {
            const { data: cachedVenue } = await supabase.from('venue_coordinates').select('coordinates, coordinates_text').eq('location_query', locationName.trim()).single();
            if (cachedVenue && (cachedVenue.coordinates_text || cachedVenue.coordinates)) {
              locationGeometry = cachedVenue.coordinates_text || cachedVenue.coordinates;
              console.log(`💾 Using cached coordinates for: ${locationName}`);
            }
          } catch (cacheError) {
            // Cache miss or error - continue without coordinates
            console.log(`💾 No cached coordinates for: ${locationName}`);
          }
        }
        // Parse dates for events table format
        let eventStartDate = null;
        let eventEndDate = null;
        let eventStartTime = '12:00:00';
        let eventEndTime = '23:59:00';
        if (event.date_time) {
          const dateObj = new Date(event.date_time);
          eventStartDate = dateObj.toISOString().split('T')[0];
          eventEndDate = eventStartDate; // Default to same day
          // Extract time if available
          const timeStr = dateObj.toISOString().split('T')[1];
          if (timeStr && timeStr !== '00:00:00.000Z') {
            eventStartTime = timeStr.split('.')[0];
          }
        }
        // Build description
        let description = `Event imported from Ticketmaster via Apify scraper`;
        if (event.description) {
          description += `\n\n${event.description}`;
        }
        if (event.genre_name || event.segment_name) {
          const genres = [
            event.genre_name,
            event.segment_name
          ].filter(Boolean);
          description += `\n\n🎵 Genre: ${genres.join(', ')}`;
        }
        if (event.performers && Array.isArray(event.performers) && event.performers.length > 0) {
          description += `\n\n🎤 Performers: ${event.performers.map((p)=>p.name || p).join(', ')}`;
        }
        description += `\n\n🔗 Ticketmaster URL: ${event.url || 'N/A'}`;
        description += `\n\n📊 Imported via Apify run: ${runId}`;
        const eventForMainTable = {
          event_id: mainEventId,
          title: event.name,
          description: description,
          website_url: event.url,
          location: locationGeometry,
          location_name: locationName || 'Unknown location',
          event_start_date: eventStartDate,
          event_end_date: eventEndDate,
          event_start_time: eventStartTime,
          event_end_time: eventEndTime,
          created_at: new Date().toISOString(),
          banner_url: event.image,
          auto_import: true,
          ticketmaster_event_id: event.event_id
        };
        eventsForMainTable.push(eventForMainTable);
      } catch (error) {
        console.error(`❌ Error preparing event ${event.event_id} for main table:`, error);
      }
    }
    console.log(`📝 Prepared ${eventsForMainTable.length} events for main table`);
    let mainTableInsertCount = 0;
    if (eventsForMainTable.length > 0) {
      console.log(`🗃️  Inserting ${eventsForMainTable.length} events into main events table...`);
      try {
        const { data: mainTableData, error: mainTableError } = await supabase.from('events').insert(eventsForMainTable).select('event_id');
        if (mainTableError) {
          console.error('❌ Main events table insert error:', mainTableError);
          throw new Error(`Failed to insert into main table: ${mainTableError.message}`);
        } else {
          mainTableInsertCount = mainTableData?.length || 0;
          console.log(`✅ Phase 3 completed successfully! Inserted ${mainTableInsertCount} events into main table`);
        }
      } catch (insertError) {
        console.error('❌ Unexpected error during main table insert:', insertError);
        throw insertError;
      }
    }
    return {
      eventsInserted: mainTableInsertCount
    };
  } catch (error) {
    console.error('❌ Phase 3 error:', error);
    return {
      error: error?.message || String(error) || 'Unknown error in Phase 3',
      eventsInserted: 0
    };
  }
}
