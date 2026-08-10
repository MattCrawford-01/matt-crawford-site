import Stripe from 'stripe';
import { sql } from '@vercel/postgres';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Simple fixed pricing — adjust to whatever you want to charge.
const PRICES = {
  digital_single: { amount: 1500, label: 'Single digital photo' },
  digital_full_set: { amount: 9900, label: 'Full digital gallery' },
  print_8x10: { amount: 3500, label: '8x10 print' },
  print_11x14: { amount: 5500, label: '11x14 print' },
  print_16x20: { amount: 8500, label: '16x20 print' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { gallerySlug, product, photoIds, shippingAddress, customerEmail } = req.body;

  if (!gallerySlug || !product || !PRICES[product]) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const galleryResult = await sql`SELECT id FROM galleries WHERE slug = ${gallerySlug};`;
  if (galleryResult.rows.length === 0) {
    return res.status(404).json({ error: 'Gallery not found' });
  }
  const galleryId = galleryResult.rows[0].id;
  const isPrint = product.startsWith('print_');

  if (isPrint && (!shippingAddress || !shippingAddress.line1)) {
    return res.status(400).json({ error: 'Shipping address is required for print orders' });
  }

  const price = PRICES[product];

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    billing_address_collection: 'required', // required for Stripe Tax to calculate correctly
    automatic_tax: { enabled: true },
    invoice_creation: { enabled: true }, // auto-generates a real Stripe invoice for every order
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: price.label },
        unit_amount: price.amount,
        tax_behavior: 'exclusive', // tax is calculated and added on top of the listed price
      },
      quantity: 1,
    }],
    metadata: {
      galleryId,
      gallerySlug,
      product,
      photoIds: JSON.stringify(photoIds || []),
      fulfillmentType: isPrint ? 'print' : 'digital',
      shippingAddress: isPrint ? JSON.stringify(shippingAddress) : '',
    },
    success_url: `https://${req.headers.host}/gallery.html?g=${gallerySlug}&order=success`,
    cancel_url: `https://${req.headers.host}/gallery.html?g=${gallerySlug}&order=cancelled`,
  });

  res.status(200).json({ checkoutUrl: session.url });
}
