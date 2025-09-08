#!/usr/bin/env node

// Debug script to find missing runs and check for the 1200 event run
const APIFY_TOKEN = process.env.APIFY_TOKEN || "your_apify_api_token_here";
const ACTOR_ID = process.env.TICKETMASTER_ACTOR_ID || 'BGrbhscS4lbqY6dyl';

if (!APIFY_TOKEN || APIFY_TOKEN === "your_apify_api_token_here") {
  console.error('❌ APIFY_TOKEN environment variable is required');
  console.error('💡 Set it with: export APIFY_TOKEN="your_actual_apify_token"');
  process.exit(1);
}

async function debugMissingRun() {
  try {
    console.log('🔍 Fetching recent runs from Apify...');
    console.log(`Using ACTOR_ID: ${ACTOR_ID}`);
    
    // Get all recent runs
    const runsResponse = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?desc=true&limit=50`, {
      headers: {
        'Authorization': `Bearer ${APIFY_TOKEN}`
      }
    });

    if (!runsResponse.ok) {
      const errorText = await runsResponse.text();
      console.error(`❌ Failed to fetch runs: ${runsResponse.statusText} - ${errorText}`);
      return;
    }

    const { data: { items: allRuns } } = await runsResponse.json();
    
    console.log(`📊 Found ${allRuns.length} recent runs`);
    console.log('');
    
    // Analyze each run to find the one with ~1200 events
    const runAnalysis = [];
    
    for (const run of allRuns) {
      try {
        // Get run details to find dataset
        const runResponse = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}`, {
          headers: {
            'Authorization': `Bearer ${APIFY_TOKEN}`
          }
        });

        if (!runResponse.ok) {
          console.warn(`⚠️  Failed to get details for run ${run.id}`);
          continue;
        }

        const runData = await runResponse.json();
        const datasetId = runData.data.defaultDatasetId;
        
        if (!datasetId) {
          console.log(`  📅 ${run.startedAt} | Run ${run.id} | NO DATASET`);
          continue;
        }

        // Get events count from dataset
        const eventsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
          headers: {
            'Authorization': `Bearer ${APIFY_TOKEN}`
          }
        });

        if (!eventsResponse.ok) {
          console.warn(`⚠️  Failed to get events for run ${run.id}`);
          continue;
        }

        const events = await eventsResponse.json();
        const eventCount = events.length;
        
        // Filter valid events (no TBA, etc.)
        const validEvents = events.filter(event => {
          if (event.name && event.name.toLowerCase().includes('tba')) return false;
          if (event.date && event.date.toLowerCase().includes('invalid date')) return false;
          if (event.dateTitle && event.dateTitle.toLowerCase().includes('tba')) return false;
          if (!event.name || event.name.trim() === '') return false;
          return true;
        });
        
        const validCount = validEvents.length;
        const filteredOut = eventCount - validCount;
        
        const analysis = {
          runId: run.id,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          status: run.status,
          totalEvents: eventCount,
          validEvents: validCount,
          filteredOut: filteredOut,
          datasetId: datasetId
        };
        
        runAnalysis.push(analysis);
        
        // Highlight runs with high event counts
        const isLargeRun = validCount >= 1000;
        const status = run.status === 'SUCCEEDED' ? '✅' : '❌';
        const highlight = isLargeRun ? '🎯' : '  ';
        
        console.log(`${highlight} ${status} ${run.startedAt} | Run ${run.id.substring(0, 8)} | ${validCount} valid events (${eventCount} total, ${filteredOut} filtered)`);
        
        // Short delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error analyzing run ${run.id}:`, error.message);
      }
    }
    
    console.log('\n📊 Run Analysis Summary:');
    console.log('='.repeat(80));
    
    // Sort by valid event count
    const sortedRuns = runAnalysis.sort((a, b) => b.validEvents - a.validEvents);
    
    console.log('\n🎯 Runs with most events:');
    sortedRuns.slice(0, 10).forEach((run, index) => {
      const date = new Date(run.startedAt).toLocaleDateString();
      const status = run.status === 'SUCCEEDED' ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${date} | Run ${run.runId.substring(0, 8)} | ${run.validEvents} events`);
    });
    
    // Find runs with ~1200 events (within 100 of 1200)
    const targetRuns = sortedRuns.filter(run => 
      run.validEvents >= 1100 && run.validEvents <= 1300
    );
    
    if (targetRuns.length > 0) {
      console.log('\n🎯 Runs with ~1200 events (likely the missing one):');
      targetRuns.forEach(run => {
        const date = new Date(run.startedAt).toLocaleDateString();
        const time = new Date(run.startedAt).toLocaleTimeString();
        const status = run.status === 'SUCCEEDED' ? '✅' : '❌';
        console.log(`${status} ${date} ${time} | Run ID: ${run.runId} | ${run.validEvents} events`);
        console.log(`   Dataset: ${run.datasetId}`);
        console.log(`   Status: ${run.status}`);
        console.log('');
      });
      
      console.log('💡 To import this specific run, use:');
      targetRuns.forEach(run => {
        console.log(`   curl -X POST [YOUR_EDGE_FUNCTION_URL] -d '{"action": "import_specific_runs", "runIds": ["${run.runId}"]}'`);
      });
    } else {
      console.log('\n❌ No runs found with ~1200 events');
    }
    
    // Show statistics
    const totalEvents = sortedRuns.reduce((sum, run) => sum + run.validEvents, 0);
    const successfulRuns = sortedRuns.filter(run => run.status === 'SUCCEEDED');
    
    console.log('\n📈 Statistics:');
    console.log(`Total runs analyzed: ${runAnalysis.length}`);
    console.log(`Successful runs: ${successfulRuns.length}`);
    console.log(`Total valid events across all runs: ${totalEvents.toLocaleString()}`);
    console.log(`Average events per successful run: ${Math.round(totalEvents / successfulRuns.length)}`);
    
    // Check for recent dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    
    const recentRuns = sortedRuns.filter(run => 
      new Date(run.startedAt) >= twoDaysAgo
    );
    
    if (recentRuns.length > 0) {
      console.log('\n🕒 Recent runs (last 2 days):');
      recentRuns.forEach(run => {
        const date = new Date(run.startedAt).toLocaleDateString();
        const time = new Date(run.startedAt).toLocaleTimeString();
        const status = run.status === 'SUCCEEDED' ? '✅' : '❌';
        console.log(`${status} ${date} ${time} | ${run.validEvents} events | Run ${run.runId.substring(0, 8)}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error in debugMissingRun:', error);
  }
}

// Run the debug function
debugMissingRun();
