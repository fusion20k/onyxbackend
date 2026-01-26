const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { sendWelcomeEmail } = require('../utils/email');

router.post('/signup', async (req, res) => {
    try {
        const { name, email, password, company } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const { data: existingUser } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(409).json({ error: 'Email already exists' });
        }

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: authError.message });
        }

        const trialStart = new Date();
        const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);

        const { error: userError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                email: email,
                name: name,
                company: company,
                display_name: name,
                role: 'member',
                trial_start: trialStart.toISOString(),
                trial_end: trialEnd.toISOString(),
                subscription_status: 'trial',
                onboarding_complete: false
            });

        if (userError) {
            console.error('User creation error:', userError);
            await supabase.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: 'User creation failed' });
        }

        const { error: workspaceError } = await supabase
            .from('workspaces')
            .insert({
                user_id: authData.user.id,
                name: 'My Workspace'
            });

        if (workspaceError) {
            console.error('Workspace creation error:', workspaceError);
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (sessionError) {
            console.error('Session creation error:', sessionError);
            return res.status(500).json({ error: 'Session creation failed' });
        }

        await sendWelcomeEmail(email, name);

        const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)));

        res.status(201).json({
            success: true,
            token: sessionData.session.access_token,
            user: {
                id: authData.user.id,
                email: email,
                name: name,
                company: company || null,
                trial_start: trialStart.toISOString(),
                trial_end: trialEnd.toISOString(),
                trial_days_remaining: trialDaysRemaining,
                subscription_status: 'trial',
                subscription_plan: null,
                onboarding_complete: false
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/create-account', async (req, res) => {
    try {
        const { invite_code, name, email, password } = req.body;

        if (!invite_code || !name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const { data: tokenData, error: tokenError } = await supabase
            .from('invite_tokens')
            .select('email, used, expires_at')
            .eq('token', invite_code)
            .single();

        if (tokenError || !tokenData) {
            return res.status(400).json({ error: 'Invalid invite code' });
        }

        if (tokenData.used) {
            return res.status(400).json({ error: 'Invite code already used' });
        }

        if (new Date(tokenData.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Invite code expired' });
        }

        const { data: existingUser } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (existingUser) {
            return res.status(409).json({ error: 'Email already exists' });
        }

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: authError.message });
        }

        const trialStart = new Date();
        const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);

        const { error: userError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                email: email,
                name: name,
                display_name: name,
                role: 'member',
                trial_start: trialStart.toISOString(),
                trial_end: trialEnd.toISOString(),
                subscription_status: 'trial',
                onboarding_complete: false
            });

        if (userError) {
            console.error('User creation error:', userError);
            await supabase.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ error: 'User creation failed' });
        }

        const { error: workspaceError } = await supabase
            .from('workspaces')
            .insert({
                user_id: authData.user.id,
                name: 'My Workspace'
            });

        if (workspaceError) {
            console.error('Workspace creation error:', workspaceError);
        }

        await supabase
            .from('invite_tokens')
            .update({ used: true })
            .eq('token', invite_code);

        const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (sessionError) {
            console.error('Session creation error:', sessionError);
            return res.status(500).json({ error: 'Session creation failed' });
        }

        await sendWelcomeEmail(email, name);

        const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)));

        res.status(201).json({
            success: true,
            token: sessionData.session.access_token,
            user: {
                id: authData.user.id,
                email: email,
                name: name,
                company: null,
                trial_start: trialStart.toISOString(),
                trial_end: trialEnd.toISOString(),
                trial_days_remaining: trialDaysRemaining,
                subscription_status: 'trial',
                subscription_plan: null,
                onboarding_complete: false
            }
        });
    } catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

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
            console.error('Login error:', error);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single();

        if (userError) {
            console.error('User fetch error:', userError);
            return res.status(404).json({ error: 'User not found' });
        }

        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.user.id);

        const trialEnd = new Date(userData.trial_end);
        const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)));

        res.json({
            success: true,
            token: data.session.access_token,
            user: {
                id: userData.id,
                email: userData.email,
                name: userData.name || userData.display_name,
                company: userData.company,
                trial_start: userData.trial_start,
                trial_end: userData.trial_end,
                trial_days_remaining: trialDaysRemaining,
                subscription_status: userData.subscription_status,
                subscription_plan: userData.subscription_plan,
                onboarding_complete: userData.onboarding_complete
            }
        });
    } catch (error) {
        console.error('Login exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);

        const { error } = await supabase.auth.admin.signOut(token);

        if (error) {
            console.error('Logout error:', error);
            return res.status(500).json({ error: 'Logout failed' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Logout exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (userError) {
            console.error('User fetch error:', userError);
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: userData });
    } catch (error) {
        console.error('Get user exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({ authenticated: false });
        }

        const token = authHeader.substring(7);

        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.json({ authenticated: false });
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (userError) {
            return res.json({ authenticated: false });
        }

        const trialEnd = new Date(userData.trial_end);
        const trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - new Date()) / (1000 * 60 * 60 * 24)));

        res.json({
            authenticated: true,
            user: {
                id: userData.id,
                email: userData.email,
                name: userData.name || userData.display_name,
                company: userData.company,
                trial_start: userData.trial_start,
                trial_end: userData.trial_end,
                trial_days_remaining: trialDaysRemaining,
                subscription_status: userData.subscription_status,
                subscription_plan: userData.subscription_plan,
                onboarding_complete: userData.onboarding_complete
            }
        });
    } catch (error) {
        console.error('Status check exception:', error);
        res.json({ authenticated: false });
    }
});

module.exports = router;
