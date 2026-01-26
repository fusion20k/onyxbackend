# Stripe Configuration Guide

## Overview
Onyx uses Stripe for subscription billing with three pricing tiers:
- **Solo**: $97/month
- **Team**: $297/month  
- **Agency**: $797/month

## Step-by-Step Setup

### 1. Create Stripe Products

1. Go to https://dashboard.stripe.com/test/products
2. Click **+ Add product** for each tier

#### Solo Plan
- **Name**: Onyx Solo
- **Description**: Perfect for individual entrepreneurs and solopreneurs
- **Pricing**: $97 USD / month (recurring)
- Click **Save product**
- Copy the **Price ID** (starts with `price_`)

#### Team Plan
- **Name**: Onyx Team
- **Description**: For small teams scaling their outreach
- **Pricing**: $297 USD / month (recurring)
- Click **Save product**
- Copy the **Price ID** (starts with `price_`)

#### Agency Plan
- **Name**: Onyx Agency
- **Description**: For agencies managing multiple clients
- **Pricing**: $797 USD / month (recurring)
- Click **Save product**
- Copy the **Price ID** (starts with `price_`)

### 2. Update Environment Variables

Edit `.env` and replace the placeholder values:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_SECRET_KEY
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_ACTUAL_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# Stripe Price IDs
STRIPE_PRICE_SOLO=price_SOLO_PRICE_ID_HERE
STRIPE_PRICE_TEAM=price_TEAM_PRICE_ID_HERE
STRIPE_PRICE_AGENCY=price_AGENCY_PRICE_ID_HERE
```

### 3. Configure Stripe Webhook

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **+ Add endpoint**
3. Set **Endpoint URL**: `https://your-backend-domain.com/api/payment/webhook`
4. Click **Select events** and add:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Update `STRIPE_WEBHOOK_SECRET` in `.env`

### 4. Get API Keys

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy **Publishable key** (starts with `pk_test_`)
3. Click **Reveal test key** for Secret key (starts with `sk_test_`)
4. Update both in `.env`

### 5. Test Payment Flow

Once configured, test the payment flow:

```bash
# 1. Create a test user
POST /api/auth/signup

# 2. Create checkout session
POST /api/payment/create-checkout-session
{
  "plan": "solo",
  "price": 97
}

# 3. Use Stripe test card: 4242 4242 4242 4242
# Expiry: Any future date
# CVC: Any 3 digits
```

## Production Setup

When ready for production:

1. Switch Stripe to **Live mode** in dashboard
2. Create the same 3 products in Live mode
3. Get Live API keys (start with `pk_live_` and `sk_live_`)
4. Create Live webhook endpoint
5. Update `.env` with Live credentials
6. Set `NODE_ENV=production`

## Webhook Testing (Local Development)

Use Stripe CLI to test webhooks locally:

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/payment/webhook

# Copy webhook signing secret to .env
# STRIPE_WEBHOOK_SECRET=whsec_...
```

## Current Configuration Status

- [ ] Stripe products created
- [ ] Price IDs copied to `.env`
- [ ] API keys configured in `.env`
- [ ] Webhook endpoint created
- [ ] Webhook secret configured
- [ ] Test payment completed

## Test Card Numbers

**Success**: 4242 4242 4242 4242  
**Decline**: 4000 0000 0000 0002  
**Requires Auth**: 4000 0025 0000 3155

See more: https://stripe.com/docs/testing
