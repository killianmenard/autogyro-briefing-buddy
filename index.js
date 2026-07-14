const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');
const Stripe = require('stripe');

// =====================================================================
//  A REMPLIR AVANT DE DEPLOYER (3 choses)
// =====================================================================

// (1) Tes 2 price_id creees en Phase 1 Stripe. Remplace les placeholders.
const ALLOWED_PRICES = [
  'price_REMPLACE_MENSUEL',
  'price_REMPLACE_ANNUEL',
];

// (2) et (3) : STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET se mettent
//     dans l'onglet "Variables et secrets" de la console (PAS ici).
//     Le code les lit via process.env ci-dessous.

// Origine autorisee a appeler les fonctions depuis le navigateur (ton app)
const ALLOWED_ORIGIN = 'https://app.monplandevol.fr';

// URLs de retour dans l'app apres paiement
const SUCCESS_URL = 'https://app.monplandevol.fr/?checkout=success';
const CANCEL_URL = 'https://app.monplandevol.fr/?checkout=cancel';

// =====================================================================
//  INITIALISATION (ne pas toucher)
// =====================================================================

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

function applyCors(res) {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

// Verifie le token Firebase envoye par l'app (en-tete Authorization: Bearer ...)
async function verifyFirebaseUser(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (e) {
    return null;
  }
}

// Retrouve (ou cree) le client Stripe rattache a un uid Firebase
async function getOrCreateCustomer(uid, email) {
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  const existing = snap.exists ? snap.get('stripeCustomerId') : null;
  if (existing) return existing;
  const customer = await stripe.customers.create({
    email: email || undefined,
    metadata: { firebaseUID: uid },
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

// Retrouve l'uid Firebase depuis une subscription Stripe
async function resolveUid(sub) {
  if (sub.metadata && sub.metadata.firebaseUID) return sub.metadata.firebaseUID;
  try {
    const customer = await stripe.customers.retrieve(sub.customer);
    if (customer && customer.metadata && customer.metadata.firebaseUID) {
      return customer.metadata.firebaseUID;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// Pose (ou retire) le statut Pro : custom claim signe serveur + miroir Firestore
async function applyTier(uid, isPro) {
  const user = await admin.auth().getUser(uid);
  const claims = user.customClaims || {};
  if (isPro) claims.stripeRole = 'pro';
  else delete claims.stripeRole;
  await admin.auth().setCustomUserClaims(uid, claims);

  await db.collection('users').doc(uid).set(
    { subscriptionTier: isPro ? 'pro' : 'free' },
    { merge: true }
  );
}

// =====================================================================
//  1) createCheckoutSession  (point d'entree : createCheckoutSession)
//     Appelee par l'app quand le pilote clique "Passer Pro".
// =====================================================================
functions.http('createCheckoutSession', async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const decoded = await verifyFirebaseUser(req);
  if (!decoded) return res.status(401).json({ error: 'unauthenticated' });

  const priceId = (req.body && req.body.priceId) || '';
  if (!ALLOWED_PRICES.includes(priceId)) {
    return res.status(400).json({ error: 'invalid_price' });
  }

  try {
    const customerId = await getOrCreateCustomer(decoded.uid, decoded.email);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: decoded.uid,
      subscription_data: { metadata: { firebaseUID: decoded.uid } },
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      allow_promotion_codes: true,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('createCheckoutSession', e);
    return res.status(500).json({ error: 'stripe_error' });
  }
});

// =====================================================================
//  2) stripeWebhook  (point d'entree : stripeWebhook)
//     Appelee par Stripe (jamais par l'app). Pose/retire le statut Pro.
// =====================================================================
functions.http('stripeWebhook', async (req, res) => {
  const sig = req.get('stripe-signature');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, WEBHOOK_SECRET);
  } catch (e) {
    console.error('Signature webhook invalide', e.message);
    return res.status(400).send('Webhook Error: ' + e.message);
  }

  try {
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object;
      const uid = await resolveUid(sub);
      if (uid) {
        const isActive = ['active', 'trialing'].includes(sub.status);
        await applyTier(uid, isActive);
      }
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('stripeWebhook handler', e);
    return res.status(500).send('handler_error');
  }
});

// =====================================================================
//  3) createPortalSession  (point d'entree : createPortalSession)
//     Bouton "Gerer mon abonnement" -> portail client Stripe.
// =====================================================================
functions.http('createPortalSession', async (req, res) => {
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const decoded = await verifyFirebaseUser(req);
  if (!decoded) return res.status(401).json({ error: 'unauthenticated' });

  try {
    const snap = await db.collection('users').doc(decoded.uid).get();
    const customerId = snap.exists ? snap.get('stripeCustomerId') : null;
    if (!customerId) return res.status(400).json({ error: 'no_customer' });
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: ALLOWED_ORIGIN,
    });
    return res.status(200).json({ url: portal.url });
  } catch (e) {
    console.error('createPortalSession', e);
    return res.status(500).json({ error: 'stripe_error' });
  }
});
