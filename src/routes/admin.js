const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { nanoid } = require('nanoid');
const { sendInviteEmail } = require('../utils/email');

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('Admin login error:', error);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', data.user.id)
            .single();

        if (userError || !userData || userData.role !== 'admin') {
            await supabase.auth.signOut();
            return res.status(403).json({ error: 'Admin access required' });
        }

        res.json({
            success: true,
            session: data.session,
            user: data.user
        });
    } catch (error) {
        console.error('Admin login exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/applications', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('applications')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Fetch applications error:', error);
            return res.status(500).json({ error: 'Failed to fetch applications' });
        }

        res.json({ applications: data });
    } catch (error) {
        console.error('Fetch applications exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/approve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { applicationId } = req.body;

        if (!applicationId) {
            return res.status(400).json({ error: 'Application ID required' });
        }

        const { data: application, error: appError } = await supabase
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .single();

        if (appError || !application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({ error: 'Application already processed' });
        }

        const { error: updateError } = await supabase
            .from('applications')
            .update({ status: 'approved', updated_at: new Date().toISOString() })
            .eq('id', applicationId);

        if (updateError) {
            console.error('Update application error:', updateError);
            return res.status(500).json({ error: 'Failed to approve application' });
        }

        const token = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 72);

        const { error: tokenError } = await supabase
            .from('invite_tokens')
            .insert({
                email: application.email,
                token: token,
                expires_at: expiresAt.toISOString(),
                application_id: applicationId
            });

        if (tokenError) {
            console.error('Create token error:', tokenError);
            return res.status(500).json({ error: 'Failed to create invite token' });
        }

        const inviteUrl = `${process.env.FRONTEND_URL}/invite?token=${token}`;
        await sendInviteEmail(application.email, token, inviteUrl);

        res.json({
            success: true,
            message: 'Application approved and invite sent',
            inviteUrl
        });
    } catch (error) {
        console.error('Approve application exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/deny', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { applicationId, reason } = req.body;

        if (!applicationId) {
            return res.status(400).json({ error: 'Application ID required' });
        }

        const { data: application, error: appError } = await supabase
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .single();

        if (appError || !application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({ error: 'Application already processed' });
        }

        const { error: updateError } = await supabase
            .from('applications')
            .update({ status: 'denied', updated_at: new Date().toISOString() })
            .eq('id', applicationId);

        if (updateError) {
            console.error('Update application error:', updateError);
            return res.status(500).json({ error: 'Failed to deny application' });
        }

        res.json({
            success: true,
            message: 'Application denied'
        });
    } catch (error) {
        console.error('Deny application exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/clear-denied', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { error, count } = await supabase
            .from('applications')
            .delete()
            .eq('status', 'denied');

        if (error) {
            console.error('Clear denied applications error:', error);
            return res.status(500).json({ error: 'Failed to clear denied applications' });
        }

        res.json({
            success: true,
            message: 'Denied applications cleared',
            count: count || 0
        });
    } catch (error) {
        console.error('Clear denied applications exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
