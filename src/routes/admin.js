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

router.get('/decisions', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, user_id } = req.query;

        let query = supabase
            .from('decisions')
            .select(`
                *,
                user:users!decisions_user_id_fkey(id, email, display_name)
            `);

        if (status) {
            query = query.eq('status', status);
        }

        if (user_id) {
            query = query.eq('user_id', user_id);
        }

        query = query.order('created_at', { ascending: false });

        const { data: decisions, error: decisionsError } = await query;

        if (decisionsError) {
            console.error('Fetch decisions error:', decisionsError);
            return res.status(500).json({ error: 'Failed to fetch decisions' });
        }

        const decisionsWithCounts = await Promise.all(decisions.map(async (decision) => {
            const { count } = await supabase
                .from('decision_feedback')
                .select('*', { count: 'exact', head: true })
                .eq('decision_id', decision.id);

            return {
                id: decision.id,
                user_id: decision.user_id,
                user_email: decision.user?.email,
                user_name: decision.user?.display_name,
                title: decision.title,
                status: decision.status,
                priority: decision.priority,
                created_at: decision.created_at,
                updated_at: decision.updated_at,
                feedback_count: count || 0
            };
        }));

        res.json({ decisions: decisionsWithCounts });
    } catch (error) {
        console.error('Get decisions exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/decisions/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: decision, error: decisionError } = await supabase
            .from('decisions')
            .select('*')
            .eq('id', id)
            .single();

        if (decisionError || !decision) {
            return res.status(404).json({ error: 'Decision not found' });
        }

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, display_name')
            .eq('id', decision.user_id)
            .single();

        if (userError) {
            console.error('Fetch user error:', userError);
        }

        const { data: feedback, error: feedbackError } = await supabase
            .from('decision_feedback')
            .select('*')
            .eq('decision_id', id)
            .order('created_at', { ascending: true });

        if (feedbackError) {
            console.error('Fetch feedback error:', feedbackError);
        }

        res.json({
            decision,
            user: user || null,
            feedback: feedback || []
        });
    } catch (error) {
        console.error('Get decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/decisions/:id/respond', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content required' });
        }

        const { data: decision, error: fetchError } = await supabase
            .from('decisions')
            .select('status')
            .eq('id', id)
            .single();

        if (fetchError || !decision) {
            return res.status(404).json({ error: 'Decision not found' });
        }

        const { data: newFeedback, error: insertError } = await supabase
            .from('decision_feedback')
            .insert({
                decision_id: id,
                author_id: req.user.id,
                author_type: 'admin',
                content: content.trim()
            })
            .select()
            .single();

        if (insertError) {
            console.error('Add admin feedback error:', insertError);
            return res.status(500).json({ error: 'Failed to add feedback' });
        }

        if (decision.status === 'under_review') {
            await supabase
                .from('decisions')
                .update({ status: 'responded' })
                .eq('id', id);
        }

        res.status(201).json({
            feedback_id: newFeedback.id
        });
    } catch (error) {
        console.error('Admin respond exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/decisions/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, priority } = req.body;

        const updateData = {};
        if (status !== undefined) updateData.status = status;
        if (priority !== undefined) updateData.priority = priority;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { error: updateError } = await supabase
            .from('decisions')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            console.error('Update decision error:', updateError);
            return res.status(500).json({ error: 'Failed to update decision' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update decision exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
