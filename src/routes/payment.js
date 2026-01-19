const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.get('/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

router.post('/create-checkout', authenticateToken, async (req, res) => {
    try {
        if (req.user.paid) {
            return res.status(400).json({ error: 'User has already paid' });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Onyx Platform Access',
                            description: 'One-time payment for platform access'
                        },
                        unit_amount: process.env.PAYMENT_AMOUNT || 5000
                    },
                    quantity: 1
                }
            ],
            success_url: `${process.env.FRONTEND_URL}/payment?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment`,
            client_reference_id: req.user.id,
            customer_email: req.user.email
        });

        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('Create checkout error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

router.post('/verify', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        if (session.payment_status !== 'paid') {
            return res.status(400).json({ error: 'Payment not completed' });
        }

        if (session.client_reference_id !== req.user.id) {
            return res.status(403).json({ error: 'Session does not match user' });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({ paid: true })
            .eq('id', req.user.id);

        if (updateError) {
            console.error('Update paid status error:', updateError);
            return res.status(500).json({ error: 'Failed to update payment status' });
        }

        res.json({
            success: true,
            message: 'Payment verified and user marked as paid'
        });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

module.exports = router;
