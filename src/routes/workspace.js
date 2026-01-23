const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

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

router.get('/active-conversation', authenticateToken, async (req, res) => {
    try {
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('status', 'active')
            .maybeSingle();

        if (convError) {
            console.error('Fetch active conversation error:', convError);
            return res.status(500).json({ error: 'Failed to fetch conversation' });
        }

        if (!conversation) {
            return res.status(404).json({ error: 'No active conversation' });
        }

        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversation.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (messagesError) {
            console.error('Fetch messages error:', messagesError);
        }

        res.json({
            conversation,
            messages: messages || []
        });
    } catch (error) {
        console.error('Get active conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/start-conversation', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || message.trim().length < 10) {
            return res.status(400).json({ error: 'Message required (min 10 characters)' });
        }

        const { data: existing } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('status', 'active')
            .maybeSingle();

        if (existing) {
            return res.status(409).json({ error: 'You already have an active conversation' });
        }

        const { data: newConversation, error: convError } = await supabase
            .from('conversations')
            .insert({
                user_id: req.user.id,
                status: 'active'
            })
            .select()
            .single();

        if (convError) {
            console.error('Create conversation error:', convError);
            return res.status(500).json({ error: 'Failed to create conversation' });
        }

        const { data: newMessage, error: msgError } = await supabase
            .from('messages')
            .insert({
                conversation_id: newConversation.id,
                author_id: req.user.id,
                author_type: 'user',
                content: message.trim()
            })
            .select()
            .single();

        if (msgError) {
            console.error('Create message error:', msgError);
            return res.status(500).json({ error: 'Failed to send message' });
        }

        res.status(201).json({
            conversation_id: newConversation.id,
            message_id: newMessage.id
        });
    } catch (error) {
        console.error('Start conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/send-message/:id', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

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

        if (conversation.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (conversation.status !== 'active') {
            return res.status(400).json({ error: 'Conversation is not active' });
        }

        let attachmentUrl = null;
        let attachmentName = null;

        if (req.file) {
            const fileName = `${req.user.id}/${Date.now()}_${req.file.originalname}`;
            
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
                author_type: 'user',
                content: content.trim(),
                attachment_url: attachmentUrl,
                attachment_name: attachmentName
            })
            .select()
            .single();

        if (insertError) {
            console.error('Send message error:', insertError);
            return res.status(500).json({ error: 'Failed to send message' });
        }

        res.status(201).json({
            message_id: newMessage.id,
            attachment_url: attachmentUrl
        });
    } catch (error) {
        console.error('Send message exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/edit-message/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content required' });
        }

        const { data: message, error: fetchError } = await supabase
            .from('messages')
            .select('author_id, created_at, deleted_at')
            .eq('id', id)
            .single();

        if (fetchError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.author_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (message.deleted_at) {
            return res.status(400).json({ error: 'Cannot edit deleted message' });
        }

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        if (new Date(message.created_at) < tenMinutesAgo) {
            return res.status(400).json({ error: 'Edit window expired (10 minutes)' });
        }

        const { error: updateError } = await supabase
            .from('messages')
            .update({
                content: content.trim(),
                edited_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) {
            console.error('Edit message error:', updateError);
            return res.status(500).json({ error: 'Failed to edit message' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Edit message exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/delete-message/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: message, error: fetchError } = await supabase
            .from('messages')
            .select('author_id, created_at, deleted_at')
            .eq('id', id)
            .single();

        if (fetchError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        if (message.author_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (message.deleted_at) {
            return res.status(400).json({ error: 'Message already deleted' });
        }

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        if (new Date(message.created_at) < tenMinutesAgo) {
            return res.status(400).json({ error: 'Delete window expired (10 minutes)' });
        }

        const { error: deleteError } = await supabase
            .from('messages')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (deleteError) {
            console.error('Delete message error:', deleteError);
            return res.status(500).json({ error: 'Failed to delete message' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Delete message exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/commit/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('user_id, status')
            .eq('id', id)
            .single();

        if (fetchError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        if (conversation.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (conversation.status !== 'active') {
            return res.status(400).json({ error: 'Conversation already resolved' });
        }

        const resolved_at = new Date().toISOString();

        const { error: updateError } = await supabase
            .from('conversations')
            .update({
                status: 'resolved',
                resolved_at
            })
            .eq('id', id);

        if (updateError) {
            console.error('Commit conversation error:', updateError);
            return res.status(500).json({ error: 'Failed to commit conversation' });
        }

        res.json({
            success: true,
            resolved_at
        });
    } catch (error) {
        console.error('Commit conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/library', authenticateToken, async (req, res) => {
    try {
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select('id, summary_card, resolved_at, created_at')
            .eq('user_id', req.user.id)
            .eq('status', 'resolved')
            .order('resolved_at', { ascending: false });

        if (error) {
            console.error('Fetch library error:', error);
            return res.status(500).json({ error: 'Failed to fetch library' });
        }

        res.json({ conversations: conversations || [] });
    } catch (error) {
        console.error('Get library exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/library/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
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
            messages: messages || []
        });
    } catch (error) {
        console.error('Get library conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/update-settings', authenticateToken, async (req, res) => {
    try {
        const { display_name, email_notifications_enabled } = req.body;

        const updateData = {};
        if (display_name !== undefined) updateData.display_name = display_name;
        if (email_notifications_enabled !== undefined) updateData.email_notifications_enabled = email_notifications_enabled;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', req.user.id);

        if (updateError) {
            console.error('Update settings error:', updateError);
            return res.status(500).json({ error: 'Failed to update settings' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
