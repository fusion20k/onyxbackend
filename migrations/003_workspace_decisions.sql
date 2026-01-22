-- Run this in Supabase SQL Editor

-- ============================================
-- DECISIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'under_review', 'responded', 'resolved')),
  priority INTEGER DEFAULT 0,
  
  situation TEXT NOT NULL,
  context TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  risks TEXT,
  unknowns TEXT,
  
  final_direction TEXT,
  reasoning TEXT,
  next_steps TEXT[],
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_user_id ON decisions(user_id);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON decisions(created_at DESC);

-- ============================================
-- DECISION FEEDBACK TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS decision_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'admin')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_decision_id ON decision_feedback(decision_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON decision_feedback(created_at);

-- ============================================
-- AUTO-UPDATE TRIGGER FOR DECISIONS
-- ============================================

DROP TRIGGER IF EXISTS update_decisions_updated_at ON decisions;
CREATE TRIGGER update_decisions_updated_at
    BEFORE UPDATE ON decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own decisions" ON decisions;
DROP POLICY IF EXISTS "Users can create decisions" ON decisions;
DROP POLICY IF EXISTS "Users can update own decisions" ON decisions;
DROP POLICY IF EXISTS "Admins view all decisions" ON decisions;
DROP POLICY IF EXISTS "Admins update all decisions" ON decisions;
DROP POLICY IF EXISTS "Service role can manage decisions" ON decisions;

DROP POLICY IF EXISTS "Users view own decision feedback" ON decision_feedback;
DROP POLICY IF EXISTS "Users add own decision feedback" ON decision_feedback;
DROP POLICY IF EXISTS "Admins view all feedback" ON decision_feedback;
DROP POLICY IF EXISTS "Admins add feedback to any decision" ON decision_feedback;
DROP POLICY IF EXISTS "Service role can manage feedback" ON decision_feedback;

-- Decisions policies
CREATE POLICY "Users can view own decisions"
ON decisions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create decisions"
ON decisions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own decisions"
ON decisions FOR UPDATE
USING (auth.uid() = user_id AND status != 'resolved');

CREATE POLICY "Admins view all decisions"
ON decisions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Admins update all decisions"
ON decisions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Service role can manage decisions"
ON decisions FOR ALL
USING (true);

-- Decision feedback policies
CREATE POLICY "Users view own decision feedback"
ON decision_feedback FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM decisions
    WHERE id = decision_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Users add own decision feedback"
ON decision_feedback FOR INSERT
WITH CHECK (
  author_id = auth.uid() AND
  author_type = 'user' AND
  EXISTS (
    SELECT 1 FROM decisions
    WHERE id = decision_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Admins view all feedback"
ON decision_feedback FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Admins add feedback to any decision"
ON decision_feedback FOR INSERT
WITH CHECK (
  author_id = auth.uid() AND
  author_type = 'admin' AND
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Service role can manage feedback"
ON decision_feedback FOR ALL
USING (true);
