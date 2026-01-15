import express from 'express';
import Stripe from 'stripe';
import { authenticate } from '../middleware/auth.js';
import { query } from '../database.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-03-02'
});

// Create checkout session
router.post('/create-checkout-session', authenticate, async (req, res) => {
  try {
    console.log('Creating checkout session for user:', req.user.id);
    const { successUrl, cancelUrl } = req.body;
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: 'Plan PRO - Barbería SaaS',
            description: 'Acceso completo a todas las funciones premium'
          },
          unit_amount: 9900, // $99 MXN in cents
          recurring: {
            interval: 'month'
          }
        },
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: req.user.id, // Ya es un UUID string
      metadata: {
        tenant_id: req.user.tenant_id
      }
    });

    console.log('Checkout session created:', session.id);
    res.json({ 
      sessionId: session.id,
      url: session.url 
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Error al crear sesión de pago: ' + error.message });
  }
});

// Webhook to handle successful payments
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    console.log('Webhook event received:', event.type);
  } catch (err) {
    console.log(`Webhook signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Checkout session completed:', session.id);
      await handleSuccessfulPayment(session);
      break;
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      console.log('Invoice payment succeeded:', invoice.id);
      await handleSubscriptionRenewal(invoice);
      break;
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('Subscription deleted:', subscription.id);
      await handleSubscriptionCancellation(subscription);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Handle successful payment
async function handleSuccessfulPayment(session) {
  try {
    const userId = session.client_reference_id; // No usar parseInt, es un UUID
    const tenantId = session.metadata.tenant_id;
    
    console.log('=== PROCESSING SUCCESSFUL PAYMENT ===');
    console.log('User ID:', userId);
    console.log('Tenant ID:', tenantId);
    console.log('Customer ID:', session.customer);
    
    // Update user subscription
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + 1);
    
    console.log('Updating user subscription to PRO until:', expirationDate);
    
    const result = await query(
      'UPDATE users SET subscription_plan = $1, subscription_expires_at = $2, stripe_customer_id = $3 WHERE id = $4 RETURNING *',
      ['pro', expirationDate, session.customer, userId]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ User successfully upgraded to PRO:', result.rows[0]);
    } else {
      console.log('❌ No user found with ID:', userId);
    }
    
  } catch (error) {
    console.error('❌ Error handling successful payment:', error);
  }
}

// Handle subscription renewal
async function handleSubscriptionRenewal(invoice) {
  try {
    const customerId = invoice.customer;
    
    // Find user by Stripe customer ID
    const users = await query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );
    
    if (users.rows.length > 0) {
      const userId = users.rows[0].id;
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + 1);
      
      await query(
        'UPDATE users SET subscription_expires_at = $1 WHERE id = $2',
        [expirationDate, userId]
      );
      
      console.log(`Subscription renewed for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription renewal:', error);
  }
}

// Handle subscription cancellation
async function handleSubscriptionCancellation(subscription) {
  try {
    const customerId = subscription.customer;
    
    // Find user by Stripe customer ID
    const users = await query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );
    
    if (users.rows.length > 0) {
      const userId = users.rows[0].id;
      
      await query(
        'UPDATE users SET subscription_plan = $1 WHERE id = $2',
        ['free', userId]
      );
      
      console.log(`Subscription cancelled for user ${userId}`);
    }
  } catch (error) {
    console.error('Error handling subscription cancellation:', error);
  }
}

// Get subscription status
router.get('/subscription-status', authenticate, async (req, res) => {
  try {
    const users = await query(
      'SELECT subscription_plan, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (users.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const user = users.rows[0];
    const now = new Date();
    const expiresAt = user.subscription_expires_at ? new Date(user.subscription_expires_at) : new Date();
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    
    res.json({
      plan: user.subscription_plan || 'free',
      daysLeft: Math.max(0, daysLeft),
      expiresAt: user.subscription_expires_at
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ error: 'Error al obtener estado de suscripción' });
  }
});

export default router;