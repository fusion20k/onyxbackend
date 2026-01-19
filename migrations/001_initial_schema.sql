-- Onyx Backend Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Applications table (stores invite applications)
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    reason TEXT NOT NULL,
    project TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invite tokens table (stores invite tokens)
CREATE TABLE IF NOT EXISTS invite_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workspaces table (user workspaces)
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT DEFAULT 'My Workspace',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email ON invite_tokens(email);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Admins can manage applications" ON applications;
DROP POLICY IF EXISTS "Service role can manage applications" ON applications;
DROP POLICY IF EXISTS "No direct access to invite tokens" ON invite_tokens;
DROP POLICY IF EXISTS "Service role can manage invite tokens" ON invite_tokens;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Service role can manage users" ON users;
DROP POLICY IF EXISTS "Users can read own workspaces" ON workspaces;
DROP POLICY IF EXISTS "Service role can manage workspaces" ON workspaces;

-- Applications policies
CREATE POLICY "Service role can manage applications"
ON applications FOR ALL
USING (true);

-- Invite tokens policies (service role only via backend)
CREATE POLICY "Service role can manage invite tokens"
ON invite_tokens FOR ALL
USING (true);

-- Users policies
CREATE POLICY "Users can read own data"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Service role can manage users"
ON users FOR ALL
USING (true);

-- Workspaces policies
CREATE POLICY "Users can read own workspaces"
ON workspaces FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage workspaces"
ON workspaces FOR ALL
USING (true);
