#!/bin/bash

# Script to convert apify_run_summary from VIEW to TABLE in Supabase
# This script requires the Supabase CLI to be installed and configured

echo "Converting apify_run_summary from VIEW to TABLE..."
echo ""
echo "⚠️  IMPORTANT: This will DROP the existing apify_run_summary VIEW"
echo "   If the view contains important logic, back it up first!"
echo ""

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Prompt for confirmation
read -p "Do you want to continue? (y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "❌ Operation cancelled"
    exit 0
fi

echo ""
echo "📝 Step 1: Backing up existing view definition..."
echo "   Run this query first to see what you're replacing:"
echo "   SELECT definition FROM pg_views WHERE viewname = 'apify_run_summary';"
echo ""

read -p "Have you backed up the view definition? (y/N): " backed_up
if [[ ! $backed_up =~ ^[Yy]$ ]]; then
    echo "❌ Please back up the view definition first"
    exit 1
fi

echo ""
echo "📝 Step 2: Executing convert-view-to-table.sql..."

# You can use either of these methods:
# Method 1: Database reset (will reset entire database)
# supabase db reset --linked

# Method 2: Push specific migration (recommended)
echo "Please manually run the convert-view-to-table.sql file in your Supabase dashboard"
echo "Or use: supabase db push (if you have migrations set up)"

echo ""
echo "✅ Instructions provided!"
echo ""
echo "Manual steps:"
echo "   1. Go to Supabase dashboard → SQL Editor"
echo "   2. Copy contents of convert-view-to-table.sql"
echo "   3. Run the SQL"
echo "   4. Verify with: SELECT * FROM apify_run_summary LIMIT 1;"
