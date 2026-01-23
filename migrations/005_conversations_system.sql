-- Run this in Supabase SQL Editor

-- ============================================
-- DROP OLD TABLES (if migrating from decisions)
-- ============================================
-- Uncomment these lines if you want to remove the old decisions system:
-- DROP TABLE IF EXISTS decision_feedback CASCADE;
-- DROP TABLE IF EXISTS decisions CASCADE;

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  priority INTEGER DEFAULT 0,
  summary_card JSONB,
  admin_notes TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Enforce one active conversation per user
  CONSTRAINT unique_active_conversation UNIQUE (user_id, status) 
    DEFERRABLE INITIALLY DEFERRED
);

-- Partial unique index for active conversations only
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_user_active 
  ON conversations(user_id) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(priority DESC);

-- ============================================
-- MESSAGES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'admin')),
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  tag TEXT,
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update conversations.updated_at
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
DROP POLICY IF EXISTS "Users can update own active conversations" ON conversations;
DROP POLICY IF EXISTS "Admins view all conversations" ON conversations;
DROP POLICY IF EXISTS "Admins update all conversations" ON conversations;
DROP POLICY IF EXISTS "Service role can manage conversations" ON conversations;

DROP POLICY IF EXISTS "Users view own conversation messages" ON messages;
DROP POLICY IF EXISTS "Users add messages to own conversations" ON messages;
DROP POLICY IF EXISTS "Users update own recent messages" ON messages;
DROP POLICY IF EXISTS "Users delete own recent messages" ON messages;
DROP POLICY IF EXISTS "Admins view all messages" ON messages;
DROP POLICY IF EXISTS "Admins add messages to any conversation" ON messages;
DROP POLICY IF EXISTS "Service role can manage messages" ON messages;

-- Conversations policies
CREATE POLICY "Users can view own conversations"
ON conversations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversations"
ON conversations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own active conversations"
ON conversations FOR UPDATE
USING (auth.uid() = user_id AND status = 'active');

CREATE POLICY "Admins view all conversations"
ON conversations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Admins update all conversations"
ON conversations FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Service role can manage conversations"
ON conversations FOR ALL
USING (true);

-- Messages policies
CREATE POLICY "Users view own conversation messages"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations
    WHERE id = conversation_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users add messages to own conversations"
ON messages FOR INSERT
WITH CHECK (
  author_id = auth.uid() AND
  author_type = 'user' AND
  EXISTS (
    SELECT 1 FROM conversations
    WHERE id = conversation_id
    AND user_id = auth.uid()
    AND status = 'active'
  )
);

CREATE POLICY "Users update own recent messages"
ON messages FOR UPDATE
USING (
  author_id = auth.uid() AND
  author_type = 'user' AND
  deleted_at IS NULL AND
  created_at > NOW() - INTERVAL '10 minutes'
);

CREATE POLICY "Users delete own recent messages"
ON messages FOR UPDATE
USING (
  author_id = auth.uid() AND
  author_type = 'user' AND
  deleted_at IS NULL AND
  created_at > NOW() - INTERVAL '10 minutes'
);

CREATE POLICY "Admins view all messages"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Admins add messages to any conversation"
ON messages FOR INSERT
WITH CHECK (
  author_id = auth.uid() AND
  author_type = 'admin' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Service role can manage messages"
ON messages FOR ALL
USING (true);
