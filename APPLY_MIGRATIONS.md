# Database Migration Instructions

## ⚠️ IMPORTANT: Apply These Migrations to Supabase

The API tests are failing because the database migrations have not been applied yet. You must apply these migrations in the **Supabase SQL Editor** before the backend will work correctly.

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project: `ovkyagrxheqwpqvxqdze`
3. Click on **SQL Editor** in the left sidebar
4. Click **New Query**

### 2. Apply Migration 012 - Trial & Subscription System

Copy the entire contents of `migrations/012_trial_subscription_system.sql` and paste it into the SQL Editor, then click **Run**.

This migration adds:
- Trial fields: `trial_start`, `trial_end`
- Subscription fields: `subscription_status`, `subscription_plan`, `stripe_subscription_id`
- Onboarding fields: `onboarding_complete`, `onboarding_data`
- User profile fields: `name`, `company`, `last_login`
- Indexes and constraints

### 3. Apply Migration 013 - Workspace Tables

Copy the entire contents of `migrations/013_workspace_tables.sql` and paste it into the SQL Editor, then click **Run**.

This migration creates:
- `workspace_leads` table (for lead pipeline management)
- `campaigns` table (for ICP configuration)
- `ai_conversations` table (for AI chat history)
- Indexes, triggers, and RLS policies

### 4. Verify Migrations

After applying both migrations, run this query to verify:

```sql
-- Check users table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('trial_start', 'trial_end', 'subscription_status', 'onboarding_complete')
ORDER BY column_name;

-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('workspace_leads', 'campaigns', 'ai_conversations')
ORDER BY table_name;
```

You should see:
- 4 rows for users columns
- 3 rows for new tables

### 5. Re-run API Tests

After applying migrations, restart the backend server and run tests again:

```bash
cd c:\Users\david\Desktop\onyxbackend
node test-api.js
```

All tests should pass (10/10).

## Files Referenced
- `migrations/012_trial_subscription_system.sql`
- `migrations/013_workspace_tables.sql`

## Current Test Status
- ✓ 4/10 tests passing (before migrations)
- Expected: 10/10 tests passing (after migrations)
