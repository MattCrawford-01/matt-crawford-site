import Stripe from 'stripe';
import { sql } from '@vercel/postgres';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Simple fixed pricing — adjust to whatever you want to charge.
const PRICES = {
  photo_single: { amount: 5999, label: 'Single digital photo' },
  photo_full_set: { amount: 19900, label: 'Full digital photo gallery' },
  video_single: { amount: 7999, label: 'Single digital video' },
  video_full_set: { amount: 19900, label: 'Full digital video collection' },
  print_18x24: { amount: 14999, label: '18×24 framed print (gold foil)' },
  print_24x36: { amount: 17999, label: '24×36 framed print (gold foil)' },
  print_30x40: { amount: 23999, label: '30×40 framed print (gold foil)' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { gallerySlug, cart, shippingAddress, customerEmail } = req.body;

  if (!gallerySlug || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  // Validate every cart line references a real product with at least one item attached
  for (const item of cart) {
    if (!PRICES[item.key] || !Array.isArray(item.mediaIds) || item.mediaIds.length === 0) {
      return res.status(400).json({ error: 'Invalid cart item' });
    }
  }

  const galleryResult = await sql`SELECT id FROM galleries WHERE slug = ${gallerySlug};`;
  if (galleryResult.rows.length === 0) {
    return res.status(404).json({ error: 'Gallery not found' });
  }
  const galleryId = galleryResult.rows[0].id;

  const hasPrint = cart.some(item => item.key.startsWith('print_'));
  const hasDigital = cart.some(item => !item.key.startsWith('print_'));
  const fulfillmentType = hasPrint && hasDigital ? 'mixed' : (hasPrint ? 'print' : 'digital');

  if (hasPrint && (!shippingAddress || !shippingAddress.line1)) {
    return res.status(400).json({ error: 'Shipping address is required for print items' });
  }

  // Build one Stripe line item per cart entry. "Single" tiers (photo, video, print) charge
  // per item selected — quantity = number of media ids attached to that line. "Full set"
  // tiers are a flat price regardless of how many items are in the gallery.
  const line_items = cart.map(item => {
    const price = PRICES[item.key];
    const isPerItem = item.key.endsWith('_single') || item.key.startsWith('print_');
    const quantity = isPerItem ? item.mediaIds.length : 1;
    return {
      price_data: {
        currency: 'usd',
        product_data: { name: isPerItem && quantity > 1 ? `${price.label} (×${quantity})` : price.label },
        unit_amount: price.amount,
        tax_behavior: 'exclusive',
      },
      quantity,
    };
  });

  // Create the order row up front, before the Stripe session exists. The full cart is
  // stored here (not in Stripe metadata, which has a 500-character-per-field limit that
  // a multi-item cart could exceed) — the webhook just looks this row up by session id
  // once payment completes and marks it paid.
  const orderResult = await sql`
    INSERT INTO orders (gallery_id, status, fulfillment_type, product_details, shipping_address, customer_email)
    VALUES (
      ${galleryId}, 'pending', ${fulfillmentType},
      ${JSON.stringify({ cart })},
      ${hasPrint ? JSON.stringify(shippingAddress) : null},
      ${customerEmail}
    )
    RETURNING id;
  `;
  const orderId = orderResult.rows[0].id;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    billing_address_collection: 'required', // required for Stripe Tax to calculate correctly
    automatic_tax: { enabled: true },
    invoice_creation: { enabled: true }, // auto-generates a real Stripe invoice for every order
    line_items,
    metadata: {
      orderId,
      galleryId,
      gallerySlug,
    },
    success_url: `https://${req.headers.host}/gallery.html?g=${gallerySlug}&order=success`,
    cancel_url: `https://${req.headers.host}/gallery.html?g=${gallerySlug}&order=cancelled`,
  });

  // Attach the real session id to the pending order now that it exists.
  await sql`UPDATE orders SET stripe_session_id = ${session.id} WHERE id = ${orderId};`;

  res.status(200).json({ checkoutUrl: session.url });
}
