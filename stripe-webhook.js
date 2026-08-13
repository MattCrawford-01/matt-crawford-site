import Stripe from 'stripe';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const meta = session.metadata;
  const photoIds = JSON.parse(meta.photoIds || '[]');
  const shippingAddress = meta.shippingAddress ? JSON.parse(meta.shippingAddress) : null;

  // invoice_creation on the Checkout Session generates a real Stripe invoice automatically —
  // session.invoice holds its ID once payment completes.
  let invoiceUrl = null;
  if (session.invoice) {
    const invoice = await stripe.invoices.retrieve(session.invoice);
    invoiceUrl = invoice.hosted_invoice_url;
  }

  // Record the order
  await sql`
    INSERT INTO orders (
      gallery_id, stripe_session_id, status, fulfillment_type,
      product_details, shipping_address, amount_total, customer_email,
      stripe_invoice_id, invoice_url
    ) VALUES (
      ${meta.galleryId}, ${session.id}, 'paid', ${meta.fulfillmentType},
      ${JSON.stringify({ product: meta.product, photoIds })},
      ${shippingAddress ? JSON.stringify(shippingAddress) : null},
      ${session.amount_total}, ${session.customer_email},
      ${session.invoice || null}, ${invoiceUrl}
    )
    ON CONFLICT (stripe_session_id) DO NOTHING;
  `;

  const galleryResult = await sql`
    SELECT client_name, client_business FROM galleries WHERE id = ${meta.galleryId};
  `;
  const gallery = galleryResult.rows[0];

  if (meta.fulfillmentType === 'digital') {
    // Look up the purchased items' full-resolution URLs (photos and/or videos)
    const mediaResult = photoIds.length
      ? await sql.query(
          `SELECT blob_url, filename, type FROM media WHERE id = ANY($1::uuid[])`,
          [photoIds]
        )
      : await sql`SELECT blob_url, filename, type FROM media WHERE gallery_id = ${meta.galleryId}`;

    const linksHtml = mediaResult.rows
      .map(m => `<li>${m.filename} (${m.type}) — <a href="https://${req.headers.host}/api/media-proxy?url=${encodeURIComponent(m.blob_url)}">Download</a></li>`)
      .join('');

    await resend.emails.send({
      from: 'Matt Crawford <orders@matt-crawford.com>',
      to: session.customer_email,
      subject: 'Your photos are ready to download',
      html: `<p>Thanks for your order! Here are your download links:</p><ul>${linksHtml}</ul>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}">View your invoice/receipt</a></p>` : ''}`,
    });
  } else {
    // Print order — notify Matt to place it with a lab manually
    const addr = shippingAddress;
    await resend.emails.send({
      from: 'Orders <orders@matt-crawford.com>',
      to: 'contact@matt-crawford.com',
      subject: `New print order — ${gallery.client_name}`,
      html: `
        <p><strong>Client:</strong> ${gallery.client_name} (${gallery.client_business || 'n/a'})</p>
        <p><strong>Product:</strong> ${meta.product}</p>
        <p><strong>Amount paid:</strong> $${(session.amount_total / 100).toFixed(2)}</p>
        <p><strong>Ship to:</strong><br>
          ${addr.name}<br>${addr.line1}<br>${addr.city}, ${addr.state} ${addr.postal_code}<br>${addr.country}
        </p>
        <p><strong>Order ID:</strong> ${session.id}</p>
        ${invoiceUrl ? `<p><strong>Invoice:</strong> <a href="${invoiceUrl}">${invoiceUrl}</a></p>` : ''}
      `,
    });
  }

  res.status(200).json({ received: true });
}
