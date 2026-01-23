-- Migration 007: Add email_notifications_enabled column to users table

-- ============================================
-- ADD EMAIL NOTIFICATIONS PREFERENCE
-- ============================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT TRUE;

-- Create index for faster lookups when checking notification preferences
CREATE INDEX IF NOT EXISTS idx_users_email_notifications 
  ON users(email_notifications_enabled) 
  WHERE email_notifications_enabled = TRUE;
