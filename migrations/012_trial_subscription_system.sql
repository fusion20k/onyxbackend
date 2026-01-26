-- Migration 012: Trial & Subscription System
-- Run this in Supabase SQL Editor
-- Transforms Onyx to autonomous outreach platform with 14-day free trial

-- Add trial fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '14 days';

-- Add subscription fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Add onboarding fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data JSONB;

-- Add user profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- Add constraints for subscription status
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_status_check;
ALTER TABLE users ADD CONSTRAINT users_subscription_status_check 
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled'));

-- Add constraints for subscription plan
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_plan_check;
ALTER TABLE users ADD CONSTRAINT users_subscription_plan_check 
    CHECK (subscription_plan IN ('solo', 'team', 'agency') OR subscription_plan IS NULL);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_trial_end ON users(trial_end);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_complete ON users(onboarding_complete);

-- Update existing users to have trial period (for testing)
UPDATE users 
SET 
    trial_start = NOW(),
    trial_end = NOW() + INTERVAL '14 days',
    subscription_status = 'trial',
    onboarding_complete = true
WHERE trial_start IS NULL;

-- Create function to calculate trial days remaining
CREATE OR REPLACE FUNCTION calculate_trial_days_remaining(trial_end_date TIMESTAMP WITH TIME ZONE)
RETURNS INTEGER AS $$
BEGIN
    RETURN GREATEST(0, EXTRACT(DAY FROM (trial_end_date - NOW()))::INTEGER);
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON COLUMN users.trial_start IS 'Trial start timestamp (14-day free trial)';
COMMENT ON COLUMN users.trial_end IS 'Trial end timestamp';
COMMENT ON COLUMN users.subscription_status IS 'trial, active, expired, or cancelled';
COMMENT ON COLUMN users.subscription_plan IS 'solo ($97), team ($297), agency ($797), or NULL';
COMMENT ON COLUMN users.onboarding_complete IS 'Whether user completed 5-step onboarding';
COMMENT ON COLUMN users.onboarding_data IS 'JSON data from onboarding (ICP config, business profile)';
