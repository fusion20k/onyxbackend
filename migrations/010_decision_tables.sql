-- New decisions table (replaces conversations)
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core decision data
  title TEXT NOT NULL,
  raw_input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'analyzing', -- 'analyzing', 'ready', 'committed'
  
  -- Extracted understanding
  goal TEXT,
  primary_metric TEXT,
  time_horizon TEXT,
  constraints TEXT[],
  risk_tolerance TEXT, -- 'conservative', 'balanced', 'aggressive'
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  committed_at TIMESTAMP WITH TIME ZONE,
  
  -- Admin fields
  admin_notes TEXT,
  manually_reviewed BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_decisions_user_id ON decisions(user_id);
CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_decisions_user_active ON decisions(user_id, status) 
  WHERE status IN ('analyzing', 'ready');

-- One active decision per user
CREATE UNIQUE INDEX idx_one_active_decision_per_user 
ON decisions(user_id) 
WHERE status IN ('analyzing', 'ready');

-- Decision options table
CREATE TABLE decision_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  
  -- Option details
  name TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  
  -- Stress test results
  upside TEXT,
  downside TEXT,
  key_assumptions TEXT[],
  fragility_score TEXT, -- 'fragile', 'balanced', 'robust'
  
  -- Simulation metrics
  success_probability DECIMAL(5,2),
  constraint_violation_risk DECIMAL(5,2),
  assumption_sensitivity DECIMAL(5,2),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_options_decision ON decision_options(decision_id, position);

-- Recommendations table
CREATE TABLE decision_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  recommended_option_id UUID REFERENCES decision_options(id),
  
  -- Recommendation content
  reasoning TEXT NOT NULL,
  why_not_alternatives TEXT,
  
  -- User response
  user_committed BOOLEAN DEFAULT FALSE,
  user_note TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_one_recommendation_per_decision 
ON decision_recommendations(decision_id);

-- Followup thread (optional v1)
CREATE TABLE decision_followups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL, -- 'user' or 'system'
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_followups_decision ON decision_followups(decision_id, created_at);
