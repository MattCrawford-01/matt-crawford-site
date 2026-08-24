import Stripe from 'stripe';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { buffer } from 'micro';
import { LICENSE_AGREEMENT_PDF_BASE64 } from '../lib/license-pdf.js';
import { buildDownloadEmailHtml } from '../lib/email-templates.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { api: { bodyParser: false } };

// Same visual system as buildDownloadEmailHtml above, adapted for the print-order
// notification you receive — internal, but styled to match your brand consistently.
function buildPrintOrderEmailHtml({
  clientName, clientBusiness, printLinesHtml, printDownloadLinksHtml,
  amountPaid, shippingAddress, orderId, invoiceUrl,
}) {
  const mono = "'IBM Plex Mono', 'Courier New', monospace";
  const body = "Arial, Helvetica, sans-serif";
  const addr = shippingAddress;

  const section = (label, contentHtml) => `
    <tr>
      <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:24px; padding-bottom:24px;">
        <p style="font-family:${mono}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#8c8c86; margin:0 0 12px;">${label}</p>
        ${contentHtml}
      </td>
    </tr>`;

  return `
<body style="margin:0; padding:0; background:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <tr>
            <td style="font-family:${mono}; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#f4f3ef; padding-bottom:32px;">
              Matt Crawford
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:36px;">
              <p style="font-family:${mono}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#8c8c86; margin:0 0 14px;">New Print Order</p>
              <h1 style="font-family:${body}; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; font-size:24px; line-height:1.3; color:#f4f3ef; margin:0 0 8px;">${clientName}</h1>
              ${clientBusiness ? `<p style="font-family:${body}; font-size:14px; color:#8c8c86; margin:0;">${clientBusiness}</p>` : ''}
            </td>
          </tr>

          ${section('Prints', `<div style="font-family:${body}; font-size:14px; color:#f4f3ef; line-height:1.8;">${printLinesHtml}</div>`)}

          ${section('Full-Res Files', `<div style="font-family:${mono}; font-size:12px; color:#8c8c86; line-height:2;">${printDownloadLinksHtml}</div>`)}

          ${section('Amount Paid (Full Order)', `<p style="font-family:${body}; font-size:18px; color:#f4f3ef; margin:0;">$${amountPaid}</p>`)}

          ${section('Ship To', `<p style="font-family:${body}; font-size:14px; color:#f4f3ef; line-height:1.7; margin:0;">${addr.name}<br>${addr.line1}<br>${addr.city}, ${addr.state} ${addr.postal_code}<br>${addr.country}</p>`)}

          ${section('Order Details', `
            <p style="font-family:${mono}; font-size:11px; color:#8c8c86; margin:0 0 10px; word-break:break-all;">Order ID: ${orderId}</p>
            ${invoiceUrl ? `<a href="${invoiceUrl}" style="font-family:${mono}; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8c8c86; text-decoration:none; border-bottom:1px solid rgba(140,140,134,0.5);">[ View Invoice / Receipt ]</a>` : ''}
          `)}

          <tr>
            <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:28px;">
              <p style="font-family:${mono}; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#8c8c86; margin:0 0 14px;">Matt Crawford — Aerial Cinematography</p>
              <p style="font-family:${body}; font-size:13px; color:#f4f3ef; margin:0 0 6px;">
                <a href="https://www.matt-crawford.com" style="color:#f4f3ef; text-decoration:none; border-bottom:1px solid rgba(244,243,239,0.28);">matt-crawford.com</a>
              </p>
              <p style="font-family:${body}; font-size:13px; color:#8c8c86; margin:0 0 6px;">
                <a href="mailto:contact@matt-crawford.com" style="color:#8c8c86; text-decoration:none;">contact@matt-crawford.com</a>
                &nbsp;·&nbsp;
                <a href="tel:+17788713118" style="color:#8c8c86; text-decoration:none;">(778) 871-3118</a>
              </p>
              <p style="font-family:${body}; font-size:13px; color:#8c8c86; margin:0 0 24px;">
                <a href="https://www.instagram.com/matt.crawf0rd/" style="color:#8c8c86; text-decoration:none;">Instagram: @matt.crawf0rd</a>
              </p>
              <p style="font-family:${mono}; font-size:10px; color:#57564f; margin:0;">© ${new Date().getFullYear()} Matt Crawford</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>`;
}

// For orders that are print-only (no digital items), there was previously no
// client-facing email at all — this closes that gap, using the same visual system
// as the digital delivery email.
function buildPrintConfirmationEmailHtml({ invoiceUrl }) {
  const mono = "'IBM Plex Mono', 'Courier New', monospace";
  const body = "Arial, Helvetica, sans-serif";
  return `
<body style="margin:0; padding:0; background:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <tr>
            <td style="font-family:${mono}; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#f4f3ef; padding-bottom:32px;">
              Matt Crawford
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:36px;">
              <p style="font-family:${mono}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#8c8c86; margin:0 0 14px;">Order Confirmed</p>
              <h1 style="font-family:${body}; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; font-size:24px; line-height:1.3; color:#f4f3ef; margin:0 0 22px;">Your Print Order<br>Is Being Prepared</h1>
              <p style="font-family:${body}; font-size:15px; line-height:1.6; color:#f4f3ef; margin:0 0 32px;">
                Thanks for your order! Your print will be professionally produced and shipped to the address you provided.
              </p>
              ${invoiceUrl ? `<p style="margin:0 0 40px;"><a href="${invoiceUrl}" style="font-family:${mono}; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8c8c86; text-decoration:none; border-bottom:1px solid rgba(140,140,134,0.5);">[ View Invoice / Receipt ]</a></p>` : '<div style="height:24px;"></div>'}
              <p style="font-family:${body}; font-size:13px; line-height:1.6; color:#8c8c86; margin:0;">
                Your content license agreement is attached to this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:28px;">
              <p style="font-family:${mono}; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#8c8c86; margin:0 0 14px;">Matt Crawford — Aerial Cinematography</p>
              <p style="font-family:${body}; font-size:13px; color:#f4f3ef; margin:0 0 6px;">
                <a href="https://www.matt-crawford.com" style="color:#f4f3ef; text-decoration:none; border-bottom:1px solid rgba(244,243,239,0.28);">matt-crawford.com</a>
              </p>
              <p style="font-family:${body}; font-size:13px; color:#8c8c86; margin:0 0 6px;">
                <a href="mailto:contact@matt-crawford.com" style="color:#8c8c86; text-decoration:none;">contact@matt-crawford.com</a>
                &nbsp;·&nbsp;
                <a href="tel:+17788713118" style="color:#8c8c86; text-decoration:none;">(778) 871-3118</a>
              </p>
              <p style="font-family:${body}; font-size:13px; color:#8c8c86; margin:0 0 24px;">
                <a href="https://www.instagram.com/matt.crawf0rd/" style="color:#8c8c86; text-decoration:none;">Instagram: @matt.crawf0rd</a>
              </p>
              <p style="font-family:${mono}; font-size:10px; color:#57564f; margin:0;">© ${new Date().getFullYear()} Matt Crawford</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>`;
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

  const licenseAttachment = {
    filename: 'matt-crawford-content-license-agreement.pdf',
    content: LICENSE_AGREEMENT_PDF_BASE64,
  };

  // Digital delivery — one email with a single zip-download link covering every
  // digital item in the cart (photos and/or video), instead of listing each file.
  // The license agreement is attached here too, since this counts as the client's
  // purchase confirmation for the order.
  if (digitalItems.length > 0) {
    const downloadUrl = `https://${req.headers.host}/api/download-order?orderId=${order.id}`;

    await resend.emails.send({
      from: 'Matt Crawford <orders@matt-crawford.com>',
      to: session.customer_email,
      subject: 'Your photos and videos are ready to download',
      html: buildDownloadEmailHtml({ downloadUrl, invoiceUrl }),
      attachments: [licenseAttachment],
    });
  }

  // Print-only orders previously had no client-facing email at all — the client only
  // ever heard from us if they also bought something digital. This closes that gap,
  // and — same as above — attaches the license agreement as part of the confirmation.
  if (printItems.length > 0 && digitalItems.length === 0) {
    await resend.emails.send({
      from: 'Matt Crawford <orders@matt-crawford.com>',
      to: session.customer_email,
      subject: 'Your print order is confirmed',
      html: buildPrintConfirmationEmailHtml({ invoiceUrl }),
      attachments: [licenseAttachment],
    });
  }

  // Print fulfillment — you're handling every print order yourself locally in
  // Vancouver, so this just notifies you with everything needed to place and ship it:
  // which sizes, which photos, and the shipping address.
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

    // Direct download links for each purchased photo, so you can pull the full-res
    // files straight from this email when you take them in to print.
    const printDownloadLinksHtml = allPrintIds
      .map(id => `<li>${mediaById[id]?.filename || id} — <a href="https://${req.headers.host}/api/media-proxy?url=${encodeURIComponent(mediaById[id].blob_url)}">Download</a></li>`)
      .join('');

    await resend.emails.send({
      from: 'Orders <orders@matt-crawford.com>',
      to: 'contact@matt-crawford.com',
      subject: `New print order — ${gallery.client_name}`,
      html: buildPrintOrderEmailHtml({
        clientName: gallery.client_name,
        clientBusiness: gallery.client_business,
        printLinesHtml,
        printDownloadLinksHtml,
        amountPaid: (session.amount_total / 100).toFixed(2),
        shippingAddress: addr,
        orderId: session.id,
        invoiceUrl,
      }),
    });
  }

  res.status(200).json({ received: true });
}
