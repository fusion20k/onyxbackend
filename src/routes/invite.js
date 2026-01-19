const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');

router.get('/validate-token', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Token required' });
        }

        const { data, error } = await supabase
            .from('invite_tokens')
            .select('email, expires_at, used')
            .eq('token', token)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: 'Invalid token' });
        }

        if (data.used) {
            return res.status(400).json({ error: 'Token already used' });
        }

        if (new Date(data.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Token expired' });
        }

        res.json({ email: data.email });
    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/validate-email', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email required' });
        }

        const { data, error } = await supabase
            .from('applications')
            .select('status')
            .eq('email', email)
            .single();

        if (error || !data) {
            return res.status(404).json({ approved: false });
        }

        if (data.status !== 'approved') {
            return res.status(403).json({ approved: false });
        }

        res.json({ approved: true });
    } catch (error) {
        console.error('Email validation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
