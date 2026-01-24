ALTER TABLE decisions
ADD COLUMN selected_option_id UUID REFERENCES decision_options(id);
