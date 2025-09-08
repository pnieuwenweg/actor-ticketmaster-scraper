import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface SupabaseEventRow {
  id?: string;
  ticketmaster_id?: string;
  name?: string;
  type?: string;
  test?: boolean;
  url?: string;
  locale?: string;
  images?: any[];
  distance?: number;
  units?: string;
  sales?: any;
  dates?: any;
  classifications?: any[];
  outlet_id?: string;
  venue_id?: string;
  attractions?: any[];
  price_ranges?: any[];
  products?: any[];
  seat_map?: any;
  accessibility?: any;
  ticket_limit?: any;
  age_restrictions?: any;
  code?: string;
  please_note?: string;
  info?: string;
  promoter?: any;
  promoters?: any[];
  social?: any;
  box_office_info?: any;
  general_info?: any;
  external_links?: any;
  version?: string;
  updated_at?: string;
  raw_event_data?: any;
  apify_run_id?: string;
}

interface GeneralEventRow {
  event_id?: string;
  title?: string;
  description?: string;
  website_url?: string;
  location?: string | null; // PostGIS geometry
  location_name?: string;
  event_start_date?: string | null;
  event_end_date?: string | null;
  event_start_time?: string;
  event_end_time?: string;
  created_at?: string;
  banner_url?: string | null;
  auto_import?: boolean;
  ticketmaster_id?: string | null;
  raw_event_data?: any;
}

// Function to generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : r & 0x3 | 0x8;
    return v.toString(16);
  });
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Environment validation
    const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN')
    const TICKETMASTER_ACTOR_ID = Deno.env.get('TICKETMASTER_ACTOR_ID')
    
    if (!APIFY_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'APIFY_TOKEN environment variable is not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (!TICKETMASTER_ACTOR_ID) {
      return new Response(
        JSON.stringify({ error: 'TICKETMASTER_ACTOR_ID environment variable is not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role key for enhanced permissions
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'import_latest_runs'

    switch (action) {
      case 'import_latest_runs':
        return await importLatestRuns(supabase, APIFY_TOKEN, TICKETMASTER_ACTOR_ID, corsHeaders)
      case 'import_run':
        const runId = url.searchParams.get('runId')
        if (!runId) {
          return new Response(
            JSON.stringify({ error: 'runId parameter is required for import_run action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        return await importSpecificRun(supabase, APIFY_TOKEN, runId, corsHeaders)
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use import_latest_runs or import_run' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Error in Edge Function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function importLatestRuns(supabase: any, apifyToken: string, actorId: string, corsHeaders: any) {
  try {
    console.log('🚀 Starting import of latest runs...')
    
    // Fetch recent runs
    const runsResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?limit=20&desc=true`,
      {
        headers: {
          'Authorization': `Bearer ${apifyToken}`
        }
      }
    )

    if (!runsResponse.ok) {
      throw new Error(`Failed to fetch runs: ${runsResponse.status} ${runsResponse.statusText}`)
    }

    const runsData = await runsResponse.json()
    console.log(`📦 Found ${runsData.data.length} recent runs`)

    if (!runsData.data || runsData.data.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No runs found', totalRuns: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the latest date
    const latestDate = runsData.data[0].startedAt.split('T')[0]
    console.log(`📅 Latest run date: ${latestDate}`)

    // Filter runs for the latest date
    const latestRuns = runsData.data.filter((run: any) => 
      run.startedAt.startsWith(latestDate) && run.status === 'SUCCEEDED'
    )

    console.log(`✅ Found ${latestRuns.length} successful runs from ${latestDate}`)

    if (latestRuns.length === 0) {
      return new Response(
        JSON.stringify({ message: `No successful runs found for date ${latestDate}`, totalRuns: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check which runs we've already processed
    const runIds = latestRuns.map((run: any) => run.id)
    const { data: processedRuns } = await supabase
      .from('apify_runs_log')
      .select('run_id')
      .in('run_id', runIds)

    const processedRunIds = new Set(processedRuns?.map((row: any) => row.run_id) || [])
    const newRuns = latestRuns.filter((run: any) => !processedRunIds.has(run.id))

    console.log(`🔄 Already processed: ${processedRunIds.size} runs`)
    console.log(`🆕 New runs to process: ${newRuns.length} runs`)

    if (newRuns.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: `All ${latestRuns.length} runs from ${latestDate} have already been processed`,
          totalRuns: latestRuns.length,
          newEvents: 0,
          updatedEvents: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process each new run
    let totalNewEvents = 0
    let totalUpdatedEvents = 0
    let geocodingCount = 0

    for (const run of newRuns) {
      console.log(`\n🔄 Processing run ${run.id}...`)
      
      try {
        const result = await processRun(supabase, apifyToken, run.id)
        totalNewEvents += result.newEvents
        totalUpdatedEvents += result.updatedEvents
        geocodingCount += result.geocodingCount
        
        // Log this run as processed
        await supabase
          .from('apify_runs_log')
          .insert({
            run_id: run.id,
            started_at: run.startedAt,
            finished_at: run.finishedAt,
            events_imported: result.newEvents + result.updatedEvents,
            processed_at: new Date().toISOString()
          })

        console.log(`✅ Run ${run.id}: ${result.newEvents} new, ${result.updatedEvents} updated`)
      } catch (error) {
        console.error(`❌ Error processing run ${run.id}:`, error)
        // Continue with other runs even if one fails
      }
    }

    const response = {
      message: `Successfully processed ${newRuns.length} runs from ${latestDate}`,
      date: latestDate,
      totalRuns: newRuns.length,
      newEvents: totalNewEvents,
      updatedEvents: totalUpdatedEvents,
      geocodingCalls: geocodingCount,
      processedRunIds: newRuns.map((run: any) => run.id)
    }

    console.log(`\n🎉 Import complete: ${totalNewEvents} new events, ${totalUpdatedEvents} updated events, ${geocodingCount} geocoding calls`)

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in importLatestRuns:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to import latest runs', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function importSpecificRun(supabase: any, apifyToken: string, runId: string, corsHeaders: any) {
  try {
    console.log(`🎯 Processing specific run: ${runId}`)
    
    const result = await processRun(supabase, apifyToken, runId)
    
    const response = {
      message: `Successfully processed run ${runId}`,
      runId: runId,
      newEvents: result.newEvents,
      updatedEvents: result.updatedEvents,
      totalEvents: result.newEvents + result.updatedEvents,
      geocodingCalls: result.geocodingCount
    }

    console.log(`✅ Run ${runId}: ${result.newEvents} new, ${result.updatedEvents} updated, ${result.geocodingCount} geocoding calls`)

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in importSpecificRun:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to import specific run', 
        details: error.message,
        runId: runId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function processRun(supabase: any, apifyToken: string, runId: string) {
  // First get the run info to get the dataset ID
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/runs/${runId}`,
    {
      headers: {
        'Authorization': `Bearer ${apifyToken}`
      }
    }
  )

  if (!runResponse.ok) {
    throw new Error(`Failed to fetch run info: ${runResponse.status} ${runResponse.statusText}`)
  }

  const runData = await runResponse.json()
  const datasetId = runData.data.defaultDatasetId

  if (!datasetId) {
    throw new Error('No dataset found for this run')
  }

  // Now fetch the dataset items
  const datasetResponse = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?format=json`,
    {
      headers: {
        'Authorization': `Bearer ${apifyToken}`
      }
    }
  )

  if (!datasetResponse.ok) {
    throw new Error(`Failed to fetch dataset: ${datasetResponse.status} ${datasetResponse.statusText}`)
  }

  const events = await datasetResponse.json()
  console.log(`📊 Found ${events.length} events in dataset ${datasetId}`)

  if (events.length === 0) {
    return { newEvents: 0, updatedEvents: 0, geocodingCount: 0 }
  }

  let geocodingCount = 0

  // Prepare events for database insertion
  const eventsToInsert: SupabaseEventRow[] = []
  const generalEventsToInsert: GeneralEventRow[] = []

  for (const event of events) {
    // Generate consistent event ID for ticketmaster_events table
    const ticketmasterEventId = generateEventId(event)
    
    // Generate unique event ID for general events table
    const generalEventId = generateUUID()

    // Prepare ticketmaster-specific event data
    const ticketmasterEvent: SupabaseEventRow = {
      id: ticketmasterEventId,
      ticketmaster_id: event.id || null,
      name: event.name || null,
      type: event.type || null,
      test: event.test || false,
      url: event.url || null,
      locale: event.locale || null,
      images: event.images || null,
      distance: event.distance || null,
      units: event.units || null,
      sales: event.sales || null,
      dates: event.dates || null,
      classifications: event.classifications || null,
      outlet_id: event.outlets?.[0]?.id || null,
      venue_id: event._embedded?.venues?.[0]?.id || null,
      attractions: event._embedded?.attractions || null,
      price_ranges: event.priceRanges || null,
      products: event.products || null,
      seat_map: event.seatmap || null,
      accessibility: event.accessibility || null,
      ticket_limit: event.ticketLimit || null,
      age_restrictions: event.ageRestrictions || null,
      code: event.code || null,
      please_note: event.pleaseNote || null,
      info: event.info || null,
      promoter: event.promoter || null,
      promoters: event.promoters || null,
      social: event.social || null,
      box_office_info: event.boxOfficeInfo || null,
      general_info: event.generalInfo || null,
      external_links: event.externalLinks || null,
      version: event._links?.self?.href?.split('?')[1] || null,
      updated_at: new Date().toISOString(),
      raw_event_data: event,
      apify_run_id: runId
    }

    eventsToInsert.push(ticketmasterEvent)

    // Prepare general event data
    const venue = event._embedded?.venues?.[0]
    const locationName = venue ? `${venue.name}, ${venue.city?.name || ''}, ${venue.country?.name || ''}`.replace(/,\s*,/g, ',').replace(/,$/, '') : 'Location TBD'
    
    // Get venue coordinates using Mapbox geocoding
    let locationGeometry: string | null = null
    if (venue && (venue.city?.name || venue.address)) {
      const locationQuery = venue.address ? 
        `${venue.address.line1 || ''} ${venue.city?.name || ''} ${venue.country?.name || ''}`.trim() :
        `${venue.city?.name || ''} ${venue.country?.name || ''}`.trim()
      
      if (locationQuery.length > 0) {
        locationGeometry = await getLocationGeometry(locationQuery)
        geocodingCount++
        
        // Add delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // Parse event dates
    const startDate = parseEventDate(event.dates?.start?.localDate)
    const endDate = parseEventDate(event.dates?.end?.localDate) || startDate
    const startTime = parseEventTime(event.dates?.start?.localTime) || '19:00:00'
    const endTime = parseEventTime(event.dates?.end?.localTime) || '23:00:00'

    // Build description
    let description = 'Event imported from Ticketmaster via Apify'
    if (event.info) {
      description += `\n\n${event.info}`
    }
    if (event.pleaseNote) {
      description += `\n\nPlease note: ${event.pleaseNote}`
    }
    if (event._embedded?.attractions?.length > 0) {
      const artists = event._embedded.attractions.map((a: any) => a.name).join(', ')
      description += `\n\n🎤 Artists: ${artists}`
    }
    if (event.url) {
      description += `\n\n🔗 Tickets: ${event.url}`
    }

    // Get banner image
    const bannerUrl = event.images?.find((img: any) => 
      img.ratio === '16_9' || img.ratio === '4_3'
    )?.url || event.images?.[0]?.url || null

    const generalEvent: GeneralEventRow = {
      event_id: generalEventId,
      title: event.name || 'Untitled Event',
      description: description,
      website_url: event.url || null,
      location: locationGeometry,
      location_name: locationName,
      event_start_date: startDate,
      event_end_date: endDate,
      event_start_time: startTime,
      event_end_time: endTime,
      created_at: new Date().toISOString(),
      banner_url: bannerUrl,
      auto_import: true,
      ticketmaster_id: event.id || null,
      raw_event_data: event
    }

    generalEventsToInsert.push(generalEvent)
  }

  // Insert into both tables using parallel operations
  console.log(`💾 Inserting ${eventsToInsert.length} events into both tables...`)

  const [ticketmasterResult, generalResult] = await Promise.all([
    supabase
      .from('events')
      .upsert(eventsToInsert, { 
        onConflict: 'id',
        count: 'exact',
        defaultToNull: false
      })
      .select('id'),
    
    supabase
      .from('general_events')
      .upsert(generalEventsToInsert, {
        onConflict: 'event_id',
        count: 'exact',
        defaultToNull: false
      })
      .select('event_id')
  ])

  if (ticketmasterResult.error) {
    console.error('Ticketmaster events database error:', ticketmasterResult.error)
    throw new Error(`Ticketmaster events insertion failed: ${ticketmasterResult.error.message}`)
  }

  if (generalResult.error) {
    console.error('General events database error:', generalResult.error)
    throw new Error(`General events insertion failed: ${generalResult.error.message}`)
  }

  // Count how many were new vs updated (simplified approach)
  const newEventsCount = ticketmasterResult.data?.length || 0
  
  // For better accuracy, we could check existing events before insertion
  // For now, assume all are new if we got successful insertions
  const newEvents = newEventsCount
  const updatedEvents = 0 // Would need more complex logic to determine actual updates

  console.log(`✅ Successfully inserted into both tables: ${newEvents} events`)

  return { newEvents, updatedEvents, geocodingCount }
}

async function getLocationGeometry(locationName: string): Promise<string | null> {
  try {
    const accessToken = Deno.env.get('MAPBOX_ACCESS_TOKEN')
    if (!accessToken) {
      console.warn('MAPBOX_ACCESS_TOKEN not found, skipping geocoding')
      return null
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationName)}.json?access_token=${accessToken}`
        const response = await fetch(url)
        
        if (response.ok) {
          const data = await response.json()
          if (data.features && data.features.length > 0) {
            const feature = data.features[0]
            const [lon, lat] = feature.center
            return `POINT(${lon} ${lat})`
          }
        }
        
        // If no results, try with simplified location name
        if (attempt === 1 && locationName.includes(',')) {
          const parts = locationName.split(',')
          if (parts.length > 1) {
            const simplifiedLocation = parts[0].trim()
            const simplifiedUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(simplifiedLocation)}.json?access_token=${accessToken}`
            const simplifiedResponse = await fetch(simplifiedUrl)
            if (simplifiedResponse.ok) {
              const simplifiedData = await simplifiedResponse.json()
              if (simplifiedData.features && simplifiedData.features.length > 0) {
                const feature = simplifiedData.features[0]
                const [lon, lat] = feature.center
                return `POINT(${lon} ${lat})`
              }
            }
          }
        }
        break
      } catch (error) {
        console.error(`Geocoding attempt ${attempt} failed for "${locationName}":`, error)
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }
    return null
  } catch (error) {
    console.error(`Error getting coordinates for "${locationName}":`, error)
    return null
  }
}

function parseEventDate(dateString: string | null): string | null {
  if (!dateString) return null
  
  try {
    // dateString should be in YYYY-MM-DD format from Ticketmaster
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return null
    
    return date.toISOString().split('T')[0]
  } catch (error) {
    console.error(`Error parsing date "${dateString}":`, error)
    return null
  }
}

function parseEventTime(timeString: string | null): string | null {
  if (!timeString) return null
  
  try {
    // timeString should be in HH:MM:SS format from Ticketmaster
    if (timeString.match(/^\d{2}:\d{2}:\d{2}$/)) {
      return timeString
    }
    // If it's just HH:MM, add :00
    if (timeString.match(/^\d{2}:\d{2}$/)) {
      return `${timeString}:00`
    }
    return null
  } catch (error) {
    console.error(`Error parsing time "${timeString}":`, error)
    return null
  }
}

function generateEventId(event: any): string {
  // If the event has a Ticketmaster ID, use it
  if (event.id) {
    return `tm_${event.id}`
  }
  
  // Otherwise, create a consistent ID from available data
  const name = (event.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 50)
  const venue = event._embedded?.venues?.[0]?.name || 'unknown_venue'
  const venueNormalized = venue.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30)
  
  // Use date if available
  let dateStr = 'no_date'
  if (event.dates?.start?.localDate) {
    dateStr = event.dates.start.localDate.replace(/-/g, '_')
  }
  
  return `event_${name}_${venueNormalized}_${dateStr}`.substring(0, 100)
}