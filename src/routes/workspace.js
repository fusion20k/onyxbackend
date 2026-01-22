const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

router.get('/active-decision', authenticateToken, async (req, res) => {
    try {
        const { data: decision, error: decisionError } = await supabase
            .from('decisions')
            .select('*')
            .eq('user_id', req.user.id)
            .neq('status', 'resolved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (decisionError) {
            console.error('Fetch active decision error:', decisionError);
            return res.status(500).json({ error: 'Failed to fetch decision' });
        }

        if (!decision) {
            return res.status(404).json({ error: 'No active decision' });
        }

        const { data: feedback, error: feedbackError } = await supabase
            .from('decision_feedback')
            .select('id, author_type, content, created_at')
            .eq('decision_id', decision.id)
            .order('created_at', { ascending: true });

        if (feedbackError) {
            console.error('Fetch feedback error:', feedbackError);
        }

        res.json({
            decision,
            feedback: feedback || []
        });
    } catch (error) {
        console.error('Get active decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/create-decision', authenticateToken, async (req, res) => {
    try {
        const { situation } = req.body;

        if (!situation || situation.length < 20) {
            return res.status(400).json({ error: 'Situation required (min 20 characters)' });
        }

        const { data: existing } = await supabase
            .from('decisions')
            .select('id')
            .eq('user_id', req.user.id)
            .neq('status', 'resolved')
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'You already have an active decision' });
        }

        const title = situation.substring(0, 50) + (situation.length > 50 ? '...' : '');

        const { data: newDecision, error: insertError } = await supabase
            .from('decisions')
            .insert({
                user_id: req.user.id,
                title,
                situation,
                status: 'in_progress'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Create decision error:', insertError);
            return res.status(500).json({ error: 'Failed to create decision' });
        }

        res.status(201).json({
            decision_id: newDecision.id,
            status: newDecision.status
        });
    } catch (error) {
        console.error('Create decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/update-decision/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { context, option_a, option_b, option_c, risks, unknowns } = req.body;

        const { data: decision, error: fetchError } = await supabase
            .from('decisions')
            .select('user_id, status')
            .eq('id', id)
            .single();

        if (fetchError || !decision) {
            return res.status(404).json({ error: 'Decision not found' });
        }

        if (decision.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (decision.status === 'resolved') {
            return res.status(400).json({ error: 'Cannot update resolved decision' });
        }

        const updateData = {};
        if (context !== undefined) updateData.context = context;
        if (option_a !== undefined) updateData.option_a = option_a;
        if (option_b !== undefined) updateData.option_b = option_b;
        if (option_c !== undefined) updateData.option_c = option_c;
        if (risks !== undefined) updateData.risks = risks;
        if (unknowns !== undefined) updateData.unknowns = unknowns;

        const allFieldsFilled = context && option_a && option_b && risks && unknowns;
        if (allFieldsFilled && decision.status === 'in_progress') {
            updateData.status = 'under_review';
        }

        const { error: updateError } = await supabase
            .from('decisions')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            console.error('Update decision error:', updateError);
            return res.status(500).json({ error: 'Failed to update decision' });
        }

        res.json({
            success: true,
            status: updateData.status || decision.status
        });
    } catch (error) {
        console.error('Update decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/add-feedback/:decision_id', authenticateToken, async (req, res) => {
    try {
        const { decision_id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content required' });
        }

        const { data: decision, error: fetchError } = await supabase
            .from('decisions')
            .select('user_id')
            .eq('id', decision_id)
            .single();

        if (fetchError || !decision) {
            return res.status(404).json({ error: 'Decision not found' });
        }

        if (decision.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { data: newFeedback, error: insertError } = await supabase
            .from('decision_feedback')
            .insert({
                decision_id,
                author_id: req.user.id,
                author_type: 'user',
                content: content.trim()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Add feedback error:', insertError);
            return res.status(500).json({ error: 'Failed to add feedback' });
        }

        res.status(201).json({
            feedback_id: newFeedback.id
        });
    } catch (error) {
        console.error('Add feedback exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/resolve-decision/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { final_direction, reasoning, next_steps } = req.body;

        if (!final_direction || !reasoning) {
            return res.status(400).json({ error: 'final_direction and reasoning required' });
        }

        const { data: decision, error: fetchError } = await supabase
            .from('decisions')
            .select('user_id, status')
            .eq('id', id)
            .single();

        if (fetchError || !decision) {
            return res.status(404).json({ error: 'Decision not found' });
        }

        if (decision.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (decision.status === 'resolved') {
            return res.status(400).json({ error: 'Decision already resolved' });
        }

        const resolved_at = new Date().toISOString();

        const { error: updateError } = await supabase
            .from('decisions')
            .update({
                status: 'resolved',
                final_direction,
                reasoning,
                next_steps: next_steps || [],
                resolved_at
            })
            .eq('id', id);

        if (updateError) {
            console.error('Resolve decision error:', updateError);
            return res.status(500).json({ error: 'Failed to resolve decision' });
        }

        res.json({
            success: true,
            resolved_at
        });
    } catch (error) {
        console.error('Resolve decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/archive', authenticateToken, async (req, res) => {
    try {
        const { data: decisions, error } = await supabase
            .from('decisions')
            .select('id, title, status, resolved_at, created_at')
            .eq('user_id', req.user.id)
            .eq('status', 'resolved')
            .order('resolved_at', { ascending: false });

        if (error) {
            console.error('Fetch archive error:', error);
            return res.status(500).json({ error: 'Failed to fetch archive' });
        }

        res.json({ decisions: decisions || [] });
    } catch (error) {
        console.error('Get archive exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/archive/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: decision, error: decisionError } = await supabase
            .from('decisions')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (decisionError || !decision) {
            return res.status(404).json({ error: 'Decision not found' });
        }

        const { data: feedback, error: feedbackError } = await supabase
            .from('decision_feedback')
            .select('id, author_type, content, created_at')
            .eq('decision_id', id)
            .order('created_at', { ascending: true });

        if (feedbackError) {
            console.error('Fetch feedback error:', feedbackError);
        }

        res.json({
            decision,
            feedback: feedback || []
        });
    } catch (error) {
        console.error('Get archived decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
