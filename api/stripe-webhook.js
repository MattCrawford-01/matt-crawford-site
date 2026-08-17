import Stripe from 'stripe';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { buffer } from 'micro';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { api: { bodyParser: false } };

// Prodigi's Sandbox and Production environments use different base URLs and API keys.
// Point PRODIGI_API_URL at the sandbox first and run real test orders before switching
// to production — see SETUP.md for the exact steps.
const PRODIGI_API_URL = process.env.PRODIGI_API_URL || 'https://api.sandbox.prodigi.com/v4.0';

// Maps our print size keys to Prodigi's product SKUs. These are placeholders —
// confirm the exact SKUs for the paper/finish you want in your Prodigi dashboard's
// product catalog before going live, and swap them in here.
const PRODIGI_SKU_MAP = {
  print_18x24: 'FRA-CLA-FOIL-GOL-18X24',
  print_24x36: 'FRA-CLA-FOIL-GOL-24X36',
  print_30x40: 'FRA-CLA-FOIL-GOL-30X40',
};

// Places the print order directly with Prodigi so it ships without any manual step.
// Returns { success, prodigiOrderId } on success, or { success: false, error } on failure —
// callers should always keep a fallback path for the failure case rather than assuming
// this always works, since it depends on a third-party API being reachable and correct.
async function createProdigiOrder({ printItems, mediaById, shippingAddress, host }) {
  const items = printItems.map(item => ({
    sku: PRODIGI_SKU_MAP[item.key],
    copies: item.mediaIds.length,
    sizing: 'fillPrintArea',
    // This product line requires a color attribute — these SKUs are the gold foil frame.
    attributes: { color: 'gold' },
    assets: item.mediaIds.map(id => ({
      printArea: 'default',
      // Prodigi fetches the image itself from this URL — routing through our own
      // media-proxy endpoint lets it reach the file without needing our private
      // storage token, since the proxy already handles that authentication.
      url: `https://${host}/api/media-proxy?url=${encodeURIComponent(mediaById[id].blob_url)}`,
    })),
  }));

  const body = {
    shippingMethod: 'Standard',
    recipient: {
      name: shippingAddress.name,
      address: {
        line1: shippingAddress.line1,
        postalOrZipCode: shippingAddress.postal_code,
        countryCode: shippingAddress.country,
        townOrCity: shippingAddress.city,
        stateOrCounty: shippingAddress.state,
      },
    },
    items,
  };

  try {
    const res = await fetch(`${PRODIGI_API_URL}/Orders`, {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.PRODIGI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: JSON.stringify(data) };
    }
    return { success: true, prodigiOrderId: data.order?.id || data.id || null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

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

  // invoice_creation on the Checkout Session generates a real Stripe invoice automatically —
  // session.invoice holds its ID once payment completes.
  let invoiceUrl = null;
  if (session.invoice) {
    const invoice = await stripe.invoices.retrieve(session.invoice);
    invoiceUrl = invoice.hosted_invoice_url;
  }

  // The order row was created up front (with the full cart) when checkout started —
  // look it up by session id and mark it paid, rather than inserting a new row here.
  const orderResult = await sql`SELECT * FROM orders WHERE stripe_session_id = ${session.id};`;
  if (orderResult.rows.length === 0) {
    // Shouldn't normally happen — every session is created with a matching order row.
    return res.status(200).json({ received: true, warning: 'No matching order found' });
  }
  const order = orderResult.rows[0];

  await sql`
    UPDATE orders SET
      status = 'paid',
      amount_total = ${session.amount_total},
      customer_email = ${session.customer_email},
      stripe_invoice_id = ${session.invoice || null},
      invoice_url = ${invoiceUrl}
    WHERE id = ${order.id};
  `;

  const cart = order.product_details.cart;
  const digitalItems = cart.filter(item => !item.key.startsWith('print_'));
  const printItems = cart.filter(item => item.key.startsWith('print_'));

  const galleryResult = await sql`
    SELECT client_name, client_business FROM galleries WHERE id = ${order.gallery_id};
  `;
  const gallery = galleryResult.rows[0];

  // Digital delivery — one email with a single zip-download link covering every
  // digital item in the cart (photos and/or video), instead of listing each file.
  if (digitalItems.length > 0) {
    const downloadUrl = `https://${req.headers.host}/api/download-order?orderId=${order.id}`;

    await resend.emails.send({
      from: 'Matt Crawford <orders@matt-crawford.com>',
      to: session.customer_email,
      subject: 'Your photos and videos are ready to download',
      html: `<p>Thanks for your order! Click below to download everything as one file:</p>
        <p><a href="${downloadUrl}">Download your photos &amp; videos</a></p>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}">View your invoice/receipt</a></p>` : ''}`,
    });
  }

  // Print fulfillment — automatically place the order with Prodigi, then always notify
  // Matt: either as a "sent successfully" record, or as a "needs manual attention" alert
  // if Prodigi couldn't be reached or rejected the order for any reason.
  if (printItems.length > 0) {
    const addr = order.shipping_address;
    const allPrintIds = [...new Set(printItems.flatMap(item => item.mediaIds))];
    const mediaResult = allPrintIds.length
      ? await sql.query(`SELECT id, filename, blob_url FROM media WHERE id = ANY($1::uuid[])`, [allPrintIds])
      : { rows: [] };
    const mediaById = Object.fromEntries(mediaResult.rows.map(m => [m.id, m]));

    const printLinesHtml = printItems.map(item => {
      const sizeLabel = item.key.replace('print_', '').replace('x', '×');
      const names = item.mediaIds.map(id => mediaById[id]?.filename || id).join(', ');
      return `<li>${sizeLabel} — ${item.mediaIds.length} print(s): ${names}</li>`;
    }).join('');

    const prodigiResult = await createProdigiOrder({
      printItems,
      mediaById,
      shippingAddress: addr,
      host: req.headers.host,
    });

    const statusBlockHtml = prodigiResult.success
      ? `<p style="color:#2a7a2a;"><strong>Sent to Prodigi automatically for fulfillment.</strong><br>Prodigi order ID: ${prodigiResult.prodigiOrderId || 'n/a'}</p>`
      : `<p style="color:#b02a2a;"><strong>Automatic fulfillment failed — this order needs to be placed manually.</strong><br>Error: ${prodigiResult.error}</p>`;

    await resend.emails.send({
      from: 'Orders <orders@matt-crawford.com>',
      to: 'contact@matt-crawford.com',
      subject: prodigiResult.success
        ? `Print order sent to Prodigi — ${gallery.client_name}`
        : `ACTION NEEDED: print order fulfillment failed — ${gallery.client_name}`,
      html: `
        ${statusBlockHtml}
        <p><strong>Client:</strong> ${gallery.client_name} (${gallery.client_business || 'n/a'})</p>
        <p><strong>Prints:</strong></p>
        <ul>${printLinesHtml}</ul>
        <p><strong>Amount paid (full order):</strong> $${(session.amount_total / 100).toFixed(2)}</p>
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
