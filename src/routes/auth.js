const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { sendWelcomeEmail } = require('../utils/email');

router.post('/create-account', async (req, res) => {
    try {
        const { token, email, password, displayName } = req.body;

        if (!password || (!token && !email)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let userEmail = email;

        if (token) {
            const { data: tokenData, error: tokenError } = await supabase
                .from('invite_tokens')
                .select('email, used, expires_at')
                .eq('token', token)
                .single();

            if (tokenError || !tokenData) {
                return res.status(400).json({ error: 'Invalid token' });
            }

            if (tokenData.used) {
                return res.status(400).json({ error: 'Token already used' });
            }

            if (new Date(tokenData.expires_at) < new Date()) {
                return res.status(400).json({ error: 'Token expired' });
            }

            userEmail = tokenData.email;
        } else {
            const { data: appData, error: appError } = await supabase
                .from('applications')
                .select('status')
                .eq('email', email)
                .single();

            if (appError || !appData || appData.status !== 'approved') {
                return res.status(403).json({ error: 'Email not approved' });
            }
        }

        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: userEmail,
            password: password,
            email_confirm: true
        });

        if (authError) {
            console.error('Auth error:', authError);
            return res.status(400).json({ error: authError.message });
        }

        const { error: userError } = await supabase
            .from('users')
            .insert({
                id: authData.user.id,
                email: userEmail,
                display_name: displayName,
                role: 'member'
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

        if (token) {
            await supabase
                .from('invite_tokens')
                .update({ used: true })
                .eq('token', token);
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
            email: userEmail,
            password: password
        });

        if (sessionError) {
            console.error('Session creation error:', sessionError);
            return res.status(500).json({ error: 'Session creation failed' });
        }

        await sendWelcomeEmail(userEmail, displayName);

        res.json({
            success: true,
            session: sessionData.session,
            user: sessionData.user
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

        res.json({
            success: true,
            session: data.session,
            user: data.user
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

        res.json({
            authenticated: true,
            user: userData
        });
    } catch (error) {
        console.error('Status check exception:', error);
        res.json({ authenticated: false });
    }
});

module.exports = router;
