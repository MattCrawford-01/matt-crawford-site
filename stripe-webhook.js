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

  // Print fulfillment — one notification to Matt covering every print item in the cart
  if (printItems.length > 0) {
    const addr = order.shipping_address;
    const allPrintIds = [...new Set(printItems.flatMap(item => item.mediaIds))];
    const mediaResult = allPrintIds.length
      ? await sql.query(`SELECT id, filename FROM media WHERE id = ANY($1::uuid[])`, [allPrintIds])
      : { rows: [] };
    const filenameById = Object.fromEntries(mediaResult.rows.map(m => [m.id, m.filename]));

    const printLinesHtml = printItems.map(item => {
      const sizeLabel = item.key.replace('print_', '').replace('x', '×');
      const names = item.mediaIds.map(id => filenameById[id] || id).join(', ');
      return `<li>${sizeLabel} — ${item.mediaIds.length} print(s): ${names}</li>`;
    }).join('');

    await resend.emails.send({
      from: 'Orders <orders@matt-crawford.com>',
      to: 'contact@matt-crawford.com',
      subject: `New print order — ${gallery.client_name}`,
      html: `
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
