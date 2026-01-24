const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');
const { extractUnderstanding, runStressTests, generateRecommendation, answerFollowup } = require('../services/decisionAnalyzer');

router.post('/create', authenticateToken, async (req, res) => {
  try {
    console.log('[DECISIONS] Create request received from user:', req.user.id);
    const { content } = req.body;

    if (!content || content.length < 50) {
      console.log('[DECISIONS] Content validation failed, length:', content?.length);
      return res.status(400).json({ 
        success: false, 
        error: 'Please provide at least 50 characters describing your decision' 
      });
    }

    console.log('[DECISIONS] Checking for existing active decision...');
    const { data: existing } = await supabase
      .from('decisions')
      .select('id')
      .eq('user_id', req.user.id)
      .in('status', ['analyzing', 'ready'])
      .maybeSingle();

    if (existing) {
      console.log('[DECISIONS] User already has active decision:', existing.id);
      return res.status(409).json({ 
        success: false, 
        error: 'You already have an active decision. Commit or archive it first.' 
      });
    }

    console.log('[DECISIONS] Extracting understanding with AI...');
    const understanding = await extractUnderstanding(content);
    console.log('[DECISIONS] Understanding extracted:', understanding.title);

    console.log('[DECISIONS] Creating decision record...');
    const { data: decision, error: decisionError } = await supabase
      .from('decisions')
      .insert({
        user_id: req.user.id,
        title: understanding.title,
        raw_input: content,
        goal: understanding.goal,
        primary_metric: understanding.primary_metric,
        time_horizon: understanding.time_horizon,
        constraints: understanding.constraints,
        risk_tolerance: understanding.risk_tolerance,
        status: 'analyzing'
      })
      .select()
      .single();

    if (decisionError) {
      console.error('[DECISIONS] Database insert error:', decisionError);
      throw decisionError;
    }
    console.log('[DECISIONS] Decision created:', decision.id);

    console.log('[DECISIONS] Creating options...');
    const optionsToInsert = understanding.options.map((opt, idx) => ({
      decision_id: decision.id,
      name: opt.name,
      description: opt.description,
      position: idx
    }));

    const { data: insertedOptions, error: optionsError } = await supabase
      .from('decision_options')
      .insert(optionsToInsert)
      .select();

    if (optionsError) {
      console.error('[DECISIONS] Options insert error:', optionsError);
      throw optionsError;
    }
    console.log('[DECISIONS] Options created:', insertedOptions.length);

    console.log('[DECISIONS] Running stress tests...');
    const stressTests = await runStressTests(decision, understanding.options);
    console.log('[DECISIONS] Stress tests complete');

    console.log('[DECISIONS] Updating options with stress test results...');
    for (let i = 0; i < insertedOptions.length; i++) {
      const test = stressTests[i];
      await supabase
        .from('decision_options')
        .update({
          upside: test.upside,
          downside: test.downside,
          key_assumptions: test.key_assumptions,
          fragility_score: test.fragility_score,
          success_probability: test.success_probability,
          constraint_violation_risk: test.constraint_violation_risk,
          assumption_sensitivity: test.assumption_sensitivity
        })
        .eq('id', insertedOptions[i].id);
    }

    console.log('[DECISIONS] Generating recommendation...');
    const recommendation = await generateRecommendation(decision, stressTests);
    const recommendedOption = insertedOptions.find(opt => opt.name === recommendation.recommended_option_name);
    console.log('[DECISIONS] Recommendation generated for:', recommendedOption?.name);

    console.log('[DECISIONS] Saving recommendation...');
    const { error: recError } = await supabase
      .from('decision_recommendations')
      .insert({
        decision_id: decision.id,
        recommended_option_id: recommendedOption?.id,
        reasoning: recommendation.reasoning,
        why_not_alternatives: recommendation.why_not_alternatives,
        execution_plan: recommendation.execution_plan
      });

    if (recError) {
      console.error('[DECISIONS] Recommendation insert error:', recError);
      throw recError;
    }

    console.log('[DECISIONS] Updating status to ready...');
    await supabase
      .from('decisions')
      .update({ status: 'ready' })
      .eq('id', decision.id);

    console.log('[DECISIONS] Decision creation complete:', decision.id);
    res.json({ success: true, decision_id: decision.id });

  } catch (error) {
    console.error('[DECISIONS] Decision creation error:', error);
    console.error('[DECISIONS] Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create decision',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

router.get('/active', authenticateToken, async (req, res) => {
  try {
    const { data: decision } = await supabase
      .from('decisions')
      .select('*')
      .eq('user_id', req.user.id)
      .in('status', ['analyzing', 'ready'])
      .maybeSingle();

    if (!decision) {
      return res.status(404).json({ success: false, message: 'No active decision' });
    }

    const { data: options } = await supabase
      .from('decision_options')
      .select('*')
      .eq('decision_id', decision.id)
      .order('position');

    const { data: recommendation } = await supabase
      .from('decision_recommendations')
      .select('*')
      .eq('decision_id', decision.id)
      .maybeSingle();

    const { data: followups } = await supabase
      .from('decision_followups')
      .select('*')
      .eq('decision_id', decision.id)
      .order('created_at');

    res.json({
      success: true,
      decision,
      options: options || [],
      recommendation,
      followups: followups || []
    });

  } catch (error) {
    console.error('Get active decision error:', error);
    res.status(500).json({ success: false, error: 'Failed to get decision' });
  }
});

router.post('/:id/confirm-understanding', authenticateToken, async (req, res) => {
  try {
    const { goal, primary_metric, time_horizon, constraints, risk_tolerance } = req.body;

    const { data: decision, error: updateError } = await supabase
      .from('decisions')
      .update({
        goal,
        primary_metric,
        time_horizon,
        constraints,
        risk_tolerance,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const { data: options } = await supabase
      .from('decision_options')
      .select('*')
      .eq('decision_id', req.params.id)
      .order('position');

    if (options && options.length > 0) {
      const stressTests = await runStressTests(decision, options);
      
      for (let i = 0; i < options.length; i++) {
        const test = stressTests[i];
        if (test) {
          await supabase
            .from('decision_options')
            .update({
              upside: test.upside,
              downside: test.downside,
              key_assumptions: test.key_assumptions,
              fragility_score: test.fragility_score,
              success_probability: test.success_probability,
              constraint_violation_risk: test.constraint_violation_risk,
              assumption_sensitivity: test.assumption_sensitivity
            })
            .eq('id', options[i].id);
        }
      }

      const recommendation = await generateRecommendation(decision, stressTests);
      const recommendedOption = options.find(opt => opt.name === recommendation.recommended_option_name);

      await supabase
        .from('decision_recommendations')
        .delete()
        .eq('decision_id', req.params.id);

      await supabase
        .from('decision_recommendations')
        .insert({
          decision_id: decision.id,
          recommended_option_id: recommendedOption?.id,
          reasoning: recommendation.reasoning,
          why_not_alternatives: recommendation.why_not_alternatives,
          execution_plan: recommendation.execution_plan
        });
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Update understanding error:', error);
    res.status(500).json({ success: false, error: 'Failed to update' });
  }
});

router.post('/:id/ask-followup', authenticateToken, async (req, res) => {
  try {
    const { question } = req.body;

    const { data: decision } = await supabase
      .from('decisions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!decision) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    const { data: history } = await supabase
      .from('decision_followups')
      .select('*')
      .eq('decision_id', req.params.id)
      .order('created_at');

    await supabase
      .from('decision_followups')
      .insert({
        decision_id: req.params.id,
        author_type: 'user',
        content: question
      });

    const answer = await answerFollowup(decision, history || [], question);

    const { data: systemMessage } = await supabase
      .from('decision_followups')
      .insert({
        decision_id: req.params.id,
        author_type: 'system',
        content: answer
      })
      .select()
      .single();

    res.json({ success: true, answer: systemMessage });

  } catch (error) {
    console.error('Followup error:', error);
    res.status(500).json({ success: false, error: 'Failed to process question' });
  }
});

router.post('/:id/commit', authenticateToken, async (req, res) => {
  try {
    const { note } = req.body;

    const { data: decision, error } = await supabase
      .from('decisions')
      .update({
        status: 'committed',
        committed_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    if (note) {
      await supabase
        .from('decision_recommendations')
        .update({ 
          user_committed: true,
          user_note: note 
        })
        .eq('decision_id', req.params.id);
    }

    res.json({ success: true, decision });

  } catch (error) {
    console.error('Commit error:', error);
    res.status(500).json({ success: false, error: 'Failed to commit decision' });
  }
});

router.get('/library', authenticateToken, async (req, res) => {
  try {
    const { data: decisions } = await supabase
      .from('decisions')
      .select('id, title, goal, committed_at, created_at')
      .eq('user_id', req.user.id)
      .eq('status', 'committed')
      .order('committed_at', { ascending: false });

    res.json({ success: true, decisions: decisions || [] });

  } catch (error) {
    console.error('Library error:', error);
    res.status(500).json({ success: false, error: 'Failed to get library' });
  }
});

router.get('/library/:id', authenticateToken, async (req, res) => {
  try {
    const { data: decision } = await supabase
      .from('decisions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!decision) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    const { data: options } = await supabase
      .from('decision_options')
      .select('*')
      .eq('decision_id', decision.id)
      .order('position');

    const { data: recommendation } = await supabase
      .from('decision_recommendations')
      .select('*')
      .eq('decision_id', decision.id)
      .maybeSingle();

    const { data: followups } = await supabase
      .from('decision_followups')
      .select('*')
      .eq('decision_id', decision.id)
      .order('created_at');

    res.json({
      success: true,
      decision,
      options: options || [],
      recommendation,
      followups: followups || []
    });

  } catch (error) {
    console.error('Get library decision error:', error);
    res.status(500).json({ success: false, error: 'Failed to get decision' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('decisions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });

  } catch (error) {
    console.error('Delete decision error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete decision' });
  }
});

module.exports = router;
