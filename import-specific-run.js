#!/usr/bin/env node

// Simple script to import a specific run by ID
// Usage: node import-specific-run.js [RUN_ID]

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
  process.exit(1);
}

const runId = process.argv[2];
if (!runId) {
  console.error('❌ Usage: node import-specific-run.js [RUN_ID]');
  console.log('Example: node import-specific-run.js 1234567890');
  process.exit(1);
}

async function importSpecificRun(runId) {
  try {
    console.log(`🚀 Importing specific run: ${runId}`);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/apify-importer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'import_specific_runs',
        runIds: [runId]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to import run: ${response.status} ${response.statusText}`);
      console.error(`❌ Error response: ${errorText}`);
      return;
    }

    const result = await response.json();
    console.log('✅ Import completed successfully!');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error importing run:', error.message);
  }
}

importSpecificRun(runId);
