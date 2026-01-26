const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

router.post('/save', authenticateToken, async (req, res) => {
    try {
        const onboardingData = req.body;

        if (!onboardingData || typeof onboardingData !== 'object') {
            return res.status(400).json({ error: 'Valid onboarding data required' });
        }

        const { error } = await supabase
            .from('users')
            .update({
                onboarding_data: onboardingData
            })
            .eq('id', req.user.id);

        if (error) {
            console.error('Save onboarding error:', error);
            return res.status(500).json({ error: 'Failed to save onboarding data' });
        }

        res.json({
            success: true,
            message: 'Onboarding data saved successfully'
        });
    } catch (error) {
        console.error('Save onboarding exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/complete', authenticateToken, async (req, res) => {
    try {
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (fetchError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({
                onboarding_complete: true
            })
            .eq('id', req.user.id);

        if (updateError) {
            console.error('Complete onboarding error:', updateError);
            return res.status(500).json({ error: 'Failed to complete onboarding' });
        }

        const trialEnd = new Date(user.trial_end);
        const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)));

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                company: user.company,
                trial_start: user.trial_start,
                trial_end: user.trial_end,
                trial_days_remaining: trialDaysRemaining,
                subscription_status: user.subscription_status,
                subscription_plan: user.subscription_plan,
                onboarding_complete: true,
                onboarding_data: user.onboarding_data
            }
        });
    } catch (error) {
        console.error('Complete onboarding exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/data', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('onboarding_data, onboarding_complete')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            onboarding_data: user.onboarding_data || null,
            onboarding_complete: user.onboarding_complete || false
        });
    } catch (error) {
        console.error('Get onboarding data exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
