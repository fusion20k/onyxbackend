const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');

router.post('/submit', async (req, res) => {
    try {
        const { name, email, role, reason, project } = req.body;

        if (!name || !email || !role || !reason) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['name', 'email', 'role', 'reason']
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (name.length < 2 || name.length > 100) {
            return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
        }

        if (reason.length < 10 || reason.length > 1000) {
            return res.status(400).json({ error: 'Reason must be between 10 and 1000 characters' });
        }

        const validRoles = ['developer', 'designer', 'manager', 'other'];
        if (!validRoles.includes(role.toLowerCase())) {
            return res.status(400).json({ 
                error: 'Invalid role',
                validRoles: validRoles
            });
        }

        const { data: existingApp, error: checkError } = await supabase
            .from('applications')
            .select('id, status, created_at')
            .eq('email', email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Check existing application error:', checkError);
            return res.status(500).json({ error: 'Failed to check existing applications' });
        }

        if (existingApp) {
            if (existingApp.status === 'pending') {
                return res.status(409).json({ 
                    error: 'You already have a pending application',
                    submittedAt: existingApp.created_at
                });
            }
            
            if (existingApp.status === 'approved') {
                return res.status(409).json({ 
                    error: 'You have already been approved. Check your email for an invite link.',
                    status: 'approved'
                });
            }

            const hoursSinceDenied = (Date.now() - new Date(existingApp.created_at)) / (1000 * 60 * 60);
            if (existingApp.status === 'denied' && hoursSinceDenied < 24) {
                return res.status(429).json({ 
                    error: 'Please wait 24 hours before reapplying after a denial',
                    canReapplyAt: new Date(new Date(existingApp.created_at).getTime() + 24 * 60 * 60 * 1000)
                });
            }
        }

        const { data: newApplication, error: insertError } = await supabase
            .from('applications')
            .insert({
                name: name.trim(),
                email: email.toLowerCase().trim(),
                role: role.toLowerCase(),
                reason: reason.trim(),
                project: project ? project.trim() : null,
                status: 'pending'
            })
            .select()
            .single();

        if (insertError) {
            console.error('Insert application error:', insertError);
            
            if (insertError.code === '23505') {
                return res.status(409).json({ error: 'An application with this email already exists' });
            }
            
            return res.status(500).json({ error: 'Failed to submit application' });
        }

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            applicationId: newApplication.id,
            status: 'pending'
        });

    } catch (error) {
        console.error('Submit application exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
