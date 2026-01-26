-- Migration 013: Workspace Tables for Autonomous Outreach
-- Run this in Supabase SQL Editor
-- Creates tables for leads, campaigns, and AI conversations

-- ============================================
-- WORKSPACE LEADS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS workspace_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    company TEXT,
    title TEXT,
    email TEXT,
    linkedin_url TEXT,
    
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'engaged', 'qualified', 'won')),
    
    first_contact TIMESTAMP WITH TIME ZONE,
    last_contact TIMESTAMP WITH TIME ZONE,
    reply_received BOOLEAN DEFAULT false,
    meeting_booked BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_leads_user_id ON workspace_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_leads_status ON workspace_leads(status);
CREATE INDEX IF NOT EXISTS idx_workspace_leads_updated_at ON workspace_leads(updated_at DESC);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_workspace_leads_updated_at ON workspace_leads;
CREATE TRIGGER update_workspace_leads_updated_at
    BEFORE UPDATE ON workspace_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CAMPAIGNS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    target_industries TEXT[],
    company_size TEXT,
    titles TEXT[],
    geography TEXT,
    messaging_tone TEXT,
    
    active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_active ON campaigns(active);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AI CONVERSATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE workspace_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- Workspace leads policies
DROP POLICY IF EXISTS "Users can manage own leads" ON workspace_leads;
CREATE POLICY "Users can manage own leads"
ON workspace_leads FOR ALL
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all leads" ON workspace_leads;
CREATE POLICY "Service role can manage all leads"
ON workspace_leads FOR ALL
USING (true);

-- Campaigns policies
DROP POLICY IF EXISTS "Users can manage own campaigns" ON campaigns;
CREATE POLICY "Users can manage own campaigns"
ON campaigns FOR ALL
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all campaigns" ON campaigns;
CREATE POLICY "Service role can manage all campaigns"
ON campaigns FOR ALL
USING (true);

-- AI conversations policies
DROP POLICY IF EXISTS "Users can manage own conversations" ON ai_conversations;
CREATE POLICY "Users can manage own conversations"
ON ai_conversations FOR ALL
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all conversations" ON ai_conversations;
CREATE POLICY "Service role can manage all conversations"
ON ai_conversations FOR ALL
USING (true);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE workspace_leads IS 'Leads managed by autonomous outreach system';
COMMENT ON TABLE campaigns IS 'ICP and campaign configuration for each user';
COMMENT ON TABLE ai_conversations IS 'AI co-founder chat conversation history';

COMMENT ON COLUMN workspace_leads.status IS 'Pipeline stage: new, engaged, qualified, won';
COMMENT ON COLUMN campaigns.target_industries IS 'Array of target industries for outreach';
COMMENT ON COLUMN campaigns.titles IS 'Array of target job titles';
COMMENT ON COLUMN ai_conversations.role IS 'Message sender: user or assistant';
