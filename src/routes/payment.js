const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const supabase = require('../utils/supabase');
const { authenticateToken } = require('../middleware/auth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
    solo: process.env.STRIPE_PRICE_SOLO,
    team: process.env.STRIPE_PRICE_TEAM,
    agency: process.env.STRIPE_PRICE_AGENCY
};

const PLAN_PRICES = {
    solo: 97,
    team: 297,
    agency: 797
};

router.get('/config', (req, res) => {
    res.json({
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

const createCheckoutHandler = async (req, res) => {
    try {
        const { plan, price } = req.body;

        if (!plan || !price) {
            return res.status(400).json({ error: 'Plan and price are required' });
        }

        if (!['solo', 'team', 'agency'].includes(plan)) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        if (PLAN_PRICES[plan] !== price) {
            return res.status(400).json({ error: 'Price does not match plan' });
        }

        const priceId = PRICE_IDS[plan];
        if (!priceId) {
            return res.status(500).json({ error: 'Price ID not configured for this plan' });
        }

        const { data: userData } = await supabase
            .from('users')
            .select('trial_start, trial_end, stripe_customer_id')
            .eq('id', req.user.id)
            .single();

        if (!userData.trial_start) {
            const trialStart = new Date();
            const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);

            await supabase
                .from('users')
                .update({
                    trial_start: trialStart.toISOString(),
                    trial_end: trialEnd.toISOString(),
                    subscription_plan: plan
                })
                .eq('id', req.user.id);
        }

        let customerId = userData.stripe_customer_id || req.user.stripe_customer_id;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: req.user.email,
                name: req.user.name || req.user.display_name,
                metadata: {
                    user_id: req.user.id
                }
            });

            customerId = customer.id;

            await supabase
                .from('users')
                .update({ stripe_customer_id: customerId })
                .eq('id', req.user.id);
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price: priceId,
                    quantity: 1
                }
            ],
            success_url: `${process.env.FRONTEND_URL}/app?payment=success`,
            cancel_url: `${process.env.FRONTEND_URL}/payment?payment=cancelled`,
            metadata: {
                user_id: req.user.id,
                plan: plan
            }
        });

        res.json({ 
            success: true,
            sessionId: session.id 
        });
    } catch (error) {
        console.error('Create checkout session error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
};

router.post('/create-checkout-session', authenticateToken, createCheckoutHandler);
router.post('/create-checkout', authenticateToken, createCheckoutHandler);

router.post('/verify', authenticateToken, async (req, res) => {
    try {
        const { data: userData } = await supabase
            .from('users')
            .select('stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan')
            .eq('id', req.user.id)
            .single();

        if (!userData || !userData.stripe_customer_id) {
            return res.json({
                success: false,
                paid: false,
                message: 'No payment found'
            });
        }

        if (userData.stripe_subscription_id) {
            const subscription = await stripe.subscriptions.retrieve(userData.stripe_subscription_id);

            if (subscription && subscription.status === 'active') {
                return res.json({
                    success: true,
                    paid: true,
                    plan: userData.subscription_plan,
                    subscription_id: userData.stripe_subscription_id,
                    status: subscription.status
                });
            }
        }

        const subscriptions = await stripe.subscriptions.list({
            customer: userData.stripe_customer_id,
            status: 'active',
            limit: 1
        });

        if (subscriptions.data.length > 0) {
            const subscription = subscriptions.data[0];
            const plan = subscription.items.data[0]?.price?.id;
            
            let planName = null;
            if (plan === PRICE_IDS.solo) planName = 'solo';
            else if (plan === PRICE_IDS.team) planName = 'team';
            else if (plan === PRICE_IDS.agency) planName = 'agency';

            await supabase
                .from('users')
                .update({
                    subscription_status: 'active',
                    subscription_plan: planName,
                    stripe_subscription_id: subscription.id,
                    subscription_start: new Date(subscription.created * 1000).toISOString()
                })
                .eq('id', req.user.id);

            return res.json({
                success: true,
                paid: true,
                plan: planName,
                subscription_id: subscription.id,
                status: subscription.status
            });
        }

        res.json({
            success: false,
            paid: false,
            message: 'No active subscription found'
        });
    } catch (error) {
        console.error('Verify payment error:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

router.post('/customer-portal', authenticateToken, async (req, res) => {
    try {
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('stripe_customer_id, email, subscription_status')
            .eq('id', req.user.id)
            .single();

        if (userError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.subscription_status === 'trial') {
            return res.status(400).json({ error: 'No subscription found' });
        }

        let customerId = user.stripe_customer_id;

        if (!customerId) {
            const customers = await stripe.customers.list({
                email: user.email,
                limit: 1
            });

            if (customers.data.length === 0) {
                return res.status(400).json({ error: 'No payment history found' });
            }

            customerId = customers.data[0].id;

            await supabase
                .from('users')
                .update({ stripe_customer_id: customerId })
                .eq('id', req.user.id);
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${process.env.FRONTEND_URL}/app`
        });

        res.json({ url: portalSession.url });
    } catch (error) {
        console.error('Customer portal error:', error);
        res.status(500).json({ error: 'Failed to create customer portal session' });
    }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                
                if (session.mode === 'subscription') {
                    const userId = session.metadata.user_id;
                    const plan = session.metadata.plan;
                    const customerId = session.customer;
                    const subscriptionId = session.subscription;

                    await supabase
                        .from('users')
                        .update({
                            subscription_status: 'active',
                            subscription_plan: plan,
                            stripe_customer_id: customerId,
                            stripe_subscription_id: subscriptionId,
                            subscription_start: new Date().toISOString()
                        })
                        .eq('id', userId);

                    console.log(`✓ Subscription activated for user ${userId} - Plan: ${plan}`);
                }
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .eq('stripe_subscription_id', subscription.id)
                    .single();

                if (user) {
                    const plan = subscription.items.data[0]?.price?.id;
                    let planName = null;
                    if (plan === PRICE_IDS.solo) planName = 'solo';
                    else if (plan === PRICE_IDS.team) planName = 'team';
                    else if (plan === PRICE_IDS.agency) planName = 'agency';

                    await supabase
                        .from('users')
                        .update({
                            subscription_status: subscription.status === 'active' ? 'active' : 'expired',
                            subscription_plan: planName
                        })
                        .eq('id', user.id);

                    console.log(`✓ Subscription updated for user ${user.id}`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .eq('stripe_subscription_id', subscription.id)
                    .single();

                if (user) {
                    await supabase
                        .from('users')
                        .update({
                            subscription_status: 'cancelled',
                            subscription_plan: null
                        })
                        .eq('id', user.id);

                    console.log(`✓ Subscription cancelled for user ${user.id}`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                
                const { data: user } = await supabase
                    .from('users')
                    .select('id')
                    .eq('stripe_customer_id', invoice.customer)
                    .single();

                if (user) {
                    console.log(`⚠ Payment failed for user ${user.id}`);
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook handler error:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

module.exports = router;
