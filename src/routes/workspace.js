const express = require('express');
const router = express.Router();
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const checkTrialAccess = async (req, res, next) => {
    try {
        const { data: userData } = await supabase
            .from('users')
            .select('subscription_status, trial_end')
            .eq('id', req.user.id)
            .single();

        if (userData.subscription_status === 'expired' || 
            (userData.trial_end && new Date(userData.trial_end) < new Date())) {
            return res.status(403).json({ 
                error: 'Trial expired',
                redirect: '/payment'
            });
        }

        next();
    } catch (error) {
        console.error('Check trial access error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.get('/metrics', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { data: leads, error: leadsError } = await supabase
            .from('workspace_leads')
            .select('id, reply_received, meeting_booked')
            .eq('user_id', req.user.id);

        if (leadsError) {
            console.error('Fetch leads error:', leadsError);
            return res.status(500).json({ error: 'Failed to fetch metrics' });
        }

        const { data: campaigns, error: campaignsError } = await supabase
            .from('campaigns')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('active', true);

        if (campaignsError) {
            console.error('Fetch campaigns error:', campaignsError);
        }

        const leadsContacted = leads ? leads.length : 0;
        const repliesReceived = leads ? leads.filter(l => l.reply_received).length : 0;
        const replyRate = leadsContacted > 0 ? (repliesReceived / leadsContacted * 100).toFixed(1) : 0;
        const meetingsBooked = leads ? leads.filter(l => l.meeting_booked).length : 0;
        const activeCampaigns = campaigns ? campaigns.length : 0;

        res.json({
            leads_contacted: leadsContacted,
            reply_rate: parseFloat(replyRate),
            meetings_booked: meetingsBooked,
            active_campaigns: activeCampaigns,
            last_updated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get metrics exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/pipeline', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { data: leads, error } = await supabase
            .from('workspace_leads')
            .select('*')
            .eq('user_id', req.user.id)
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Fetch pipeline error:', error);
            return res.status(500).json({ error: 'Failed to fetch pipeline' });
        }

        const pipeline = {
            new: [],
            engaged: [],
            qualified: [],
            won: []
        };

        if (leads) {
            leads.forEach(lead => {
                const leadData = {
                    id: lead.id,
                    name: lead.name,
                    company: lead.company,
                    title: lead.title,
                    email: lead.email,
                    linkedin_url: lead.linkedin_url,
                    last_contact: lead.last_contact,
                    status: lead.status
                };

                if (pipeline[lead.status]) {
                    pipeline[lead.status].push(leadData);
                }
            });
        }

        res.json(pipeline);
    } catch (error) {
        console.error('Get pipeline exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/pipeline/move', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { lead_id, from_status, to_status } = req.body;

        if (!lead_id || !from_status || !to_status) {
            return res.status(400).json({ error: 'lead_id, from_status, and to_status are required' });
        }

        const validStatuses = ['new', 'engaged', 'qualified', 'won'];
        if (!validStatuses.includes(from_status) || !validStatuses.includes(to_status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const { data: lead, error: fetchError } = await supabase
            .from('workspace_leads')
            .select('user_id, status')
            .eq('id', lead_id)
            .single();

        if (fetchError || !lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        if (lead.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (lead.status !== from_status) {
            return res.status(400).json({ error: 'Lead status does not match from_status' });
        }

        const { error: updateError } = await supabase
            .from('workspace_leads')
            .update({
                status: to_status,
                updated_at: new Date().toISOString()
            })
            .eq('id', lead_id);

        if (updateError) {
            console.error('Move lead error:', updateError);
            return res.status(500).json({ error: 'Failed to move lead' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Move lead exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/campaign', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { data: campaign, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('user_id', req.user.id)
            .eq('active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Fetch campaign error:', error);
            return res.status(500).json({ error: 'Failed to fetch campaign' });
        }

        if (!campaign) {
            return res.json({
                target_industries: [],
                company_size: null,
                titles: [],
                geography: null,
                messaging_tone: null
            });
        }

        res.json({
            target_industries: campaign.target_industries || [],
            company_size: campaign.company_size,
            titles: campaign.titles || [],
            geography: campaign.geography,
            messaging_tone: campaign.messaging_tone
        });
    } catch (error) {
        console.error('Get campaign exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.patch('/campaign', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { target_industries, company_size, titles, geography, messaging_tone } = req.body;

        const { data: existing, error: fetchError } = await supabase
            .from('campaigns')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('active', true)
            .maybeSingle();

        if (fetchError) {
            console.error('Fetch campaign error:', fetchError);
            return res.status(500).json({ error: 'Failed to fetch campaign' });
        }

        const campaignData = {
            target_industries: target_industries || [],
            company_size,
            titles: titles || [],
            geography,
            messaging_tone,
            updated_at: new Date().toISOString()
        };

        let result;

        if (existing) {
            const { error: updateError } = await supabase
                .from('campaigns')
                .update(campaignData)
                .eq('id', existing.id);

            if (updateError) {
                console.error('Update campaign error:', updateError);
                return res.status(500).json({ error: 'Failed to update campaign' });
            }
        } else {
            const { error: insertError } = await supabase
                .from('campaigns')
                .insert({
                    ...campaignData,
                    user_id: req.user.id,
                    active: true
                });

            if (insertError) {
                console.error('Create campaign error:', insertError);
                return res.status(500).json({ error: 'Failed to create campaign' });
            }
        }

        res.json({
            success: true,
            updated_at: campaignData.updated_at
        });
    } catch (error) {
        console.error('Update campaign exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/analytics', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const period = req.query.period || '30d';
        
        let daysBack = 30;
        if (period === '7d') daysBack = 7;
        else if (period === '90d') daysBack = 90;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const { data: leads, error } = await supabase
            .from('workspace_leads')
            .select('*')
            .eq('user_id', req.user.id)
            .gte('created_at', startDate.toISOString());

        if (error) {
            console.error('Fetch analytics error:', error);
            return res.status(500).json({ error: 'Failed to fetch analytics' });
        }

        const outreachVolume = {};
        const replyRateData = {};

        if (leads) {
            leads.forEach(lead => {
                const date = lead.created_at ? lead.created_at.split('T')[0] : null;
                if (date) {
                    outreachVolume[date] = (outreachVolume[date] || 0) + 1;
                }
            });

            Object.keys(outreachVolume).forEach(date => {
                const dayLeads = leads.filter(l => l.created_at && l.created_at.startsWith(date));
                const dayReplies = dayLeads.filter(l => l.reply_received).length;
                replyRateData[date] = dayLeads.length > 0 ? (dayReplies / dayLeads.length * 100).toFixed(1) : 0;
            });
        }

        const outreachVolumeArray = Object.keys(outreachVolume).map(date => ({
            date,
            count: outreachVolume[date]
        })).sort((a, b) => a.date.localeCompare(b.date));

        const replyRateArray = Object.keys(replyRateData).map(date => ({
            date,
            rate: parseFloat(replyRateData[date])
        })).sort((a, b) => a.date.localeCompare(b.date));

        const contacted = leads ? leads.length : 0;
        const replied = leads ? leads.filter(l => l.reply_received).length : 0;
        const qualified = leads ? leads.filter(l => l.status === 'qualified' || l.status === 'won').length : 0;
        const meetings = leads ? leads.filter(l => l.meeting_booked).length : 0;

        res.json({
            outreach_volume: outreachVolumeArray,
            reply_rate: replyRateArray,
            conversion_funnel: {
                contacted,
                replied,
                qualified,
                meetings
            }
        });
    } catch (error) {
        console.error('Get analytics exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/conversations', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { data: messages, error } = await supabase
            .from('ai_conversations')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Fetch conversations error:', error);
            return res.status(500).json({ error: 'Failed to fetch conversations' });
        }

        res.json({
            messages: messages || []
        });
    } catch (error) {
        console.error('Get conversations exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/conversations/send', authenticateToken, checkTrialAccess, async (req, res) => {
    try {
        const { content } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const { data: userMessage, error: userMsgError } = await supabase
            .from('ai_conversations')
            .insert({
                user_id: req.user.id,
                role: 'user',
                content: content.trim()
            })
            .select()
            .single();

        if (userMsgError) {
            console.error('Save user message error:', userMsgError);
            return res.status(500).json({ error: 'Failed to save message' });
        }

        const { data: history, error: historyError } = await supabase
            .from('ai_conversations')
            .select('role, content')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: true })
            .limit(20);

        if (historyError) {
            console.error('Fetch history error:', historyError);
        }

        const messages = [
            {
                role: 'system',
                content: `You are an AI co-founder for Onyx, an autonomous outreach platform. You help users with:
- Setting up and optimizing their outreach campaigns
- Analyzing lead pipeline and conversion metrics
- Providing strategic advice on B2B sales and outreach
- Troubleshooting campaign performance issues
- Answering questions about the platform features

Be concise, actionable, and supportive. Focus on helping the user succeed with their outreach goals.`
            },
            ...(history || []).map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages,
            max_tokens: 500,
            temperature: 0.7
        });

        const assistantResponse = completion.choices[0]?.message?.content || 'Sorry, I encountered an error.';

        const { data: assistantMessage, error: assistantMsgError } = await supabase
            .from('ai_conversations')
            .insert({
                user_id: req.user.id,
                role: 'assistant',
                content: assistantResponse
            })
            .select()
            .single();

        if (assistantMsgError) {
            console.error('Save assistant message error:', assistantMsgError);
            return res.status(500).json({ error: 'Failed to save response' });
        }

        res.status(201).json({
            message_id: userMessage.id,
            response: {
                id: assistantMessage.id,
                role: 'assistant',
                content: assistantResponse,
                created_at: assistantMessage.created_at
            }
        });
    } catch (error) {
        console.error('Send conversation exception:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
