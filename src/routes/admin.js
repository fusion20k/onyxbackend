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

router.get('/conversations', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, user_id } = req.query;

        let query = supabase
            .from('conversations')
            .select('*');

        if (status) {
            query = query.eq('status', status);
        }

        if (user_id) {
            query = query.eq('user_id', user_id);
        }

        query = query.order('priority', { ascending: false }).order('created_at', { ascending: false });

        const { data: conversations, error: conversationsError } = await query;

        if (conversationsError) {
            console.error('Fetch conversations error:', conversationsError);
            return res.status(500).json({ error: 'Failed to fetch conversations' });
        }

        const conversationsWithDetails = await Promise.all(conversations.map(async (conversation) => {
            const { data: user } = await supabase
                .from('users')
                .select('id, email, display_name')
                .eq('id', conversation.user_id)
                .single();

            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conversation.id)
                .is('deleted_at', null);

            return {
                id: conversation.id,
                user_id: conversation.user_id,
                user_email: user?.email || 'Unknown',
                user_name: user?.display_name || 'Unknown',
                status: conversation.status,
                priority: conversation.priority,
                summary_card: conversation.summary_card,
                created_at: conversation.created_at,
                updated_at: conversation.updated_at,
                message_count: count || 0
            };
        }));

        res.json({ conversations: conversationsWithDetails });
    } catch (error) {
        console.error('Get conversations exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/conversations/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: conversation, error: conversationError } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .single();

        if (conversationError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, display_name, email_notifications_enabled')
            .eq('id', conversation.user_id)
            .single();

        if (userError) {
            console.error('Fetch user error:', userError);
        }

        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (messagesError) {
            console.error('Fetch messages error:', messagesError);
        }

        res.json({
            conversation,
            user: user || null,
            messages: messages || []
        });
    } catch (error) {
        console.error('Get conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const multer = require('multer');
const { sendAdminResponseEmail } = require('../utils/email');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PNG, JPG, and PDF files are allowed'));
        }
    }
});

router.post('/conversations/:id/respond', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { content, tag } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content required' });
        }

        const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('user_id, status')
            .eq('id', id)
            .single();

        if (fetchError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        let attachmentUrl = null;
        let attachmentName = null;

        if (req.file) {
            const fileName = `admin/${Date.now()}_${req.file.originalname}`;
            
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('message-attachments')
                .upload(fileName, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error('File upload error:', uploadError);
                return res.status(500).json({ error: 'Failed to upload file' });
            }

            const { data: urlData } = supabase.storage
                .from('message-attachments')
                .getPublicUrl(fileName);

            attachmentUrl = urlData.publicUrl;
            attachmentName = req.file.originalname;
        }

        const { data: newMessage, error: insertError } = await supabase
            .from('messages')
            .insert({
                conversation_id: id,
                author_id: req.user.id,
                author_type: 'admin',
                content: content.trim(),
                tag: tag || null,
                attachment_url: attachmentUrl,
                attachment_name: attachmentName
            })
            .select()
            .single();

        if (insertError) {
            console.error('Add admin message error:', insertError);
            return res.status(500).json({ error: 'Failed to add message' });
        }

        const { data: user } = await supabase
            .from('users')
            .select('email, email_notifications_enabled')
            .eq('id', conversation.user_id)
            .single();

        if (user && user.email_notifications_enabled) {
            await sendAdminResponseEmail(user.email, content.substring(0, 100));
        }

        res.status(201).json({
            message_id: newMessage.id
        });
    } catch (error) {
        console.error('Admin respond exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/conversations/:id/summary', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { summary_card } = req.body;

        if (!summary_card) {
            return res.status(400).json({ error: 'summary_card required' });
        }

        const { error: updateError } = await supabase
            .from('conversations')
            .update({ summary_card })
            .eq('id', id);

        if (updateError) {
            console.error('Update summary error:', updateError);
            return res.status(500).json({ error: 'Failed to update summary' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update summary exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/conversations/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { priority, admin_notes } = req.body;

        const updateData = {};
        if (priority !== undefined) updateData.priority = priority;
        if (admin_notes !== undefined) updateData.admin_notes = admin_notes;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { error: updateError } = await supabase
            .from('conversations')
            .update(updateData)
            .eq('id', id);

        if (updateError) {
            console.error('Update conversation error:', updateError);
            return res.status(500).json({ error: 'Failed to update conversation' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
