import { sql } from '@vercel/postgres';
import { Resend } from 'resend';
import { isAuthorized } from '../lib/auth.js';
import { LICENSE_AGREEMENT_PDF_BASE64 } from '../lib/license-pdf.js';
import { buildDownloadEmailHtml } from '../lib/email-templates.js';

const resend = new Resend(process.env.RESEND_API_KEY);

// Sends the same branded download email used for real purchases, but skips the
// cart/Stripe checkout entirely — for footage from a hired shoot that's being
// invoiced separately, outside this system.
//
// Reuses the existing /api/download-order zip-download endpoint by creating a normal
// order row marked 'paid' with no real Stripe session attached — download-order.js
// only checks status and the cart's media ids, so this works without any changes there.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { galleryId, mediaIds, clientEmail, invoicePdfBase64, invoicePdfFilename } = req.body;

  if (!galleryId || !Array.isArray(mediaIds) || mediaIds.length === 0 || !clientEmail) {
    return res.status(400).json({ error: 'galleryId, mediaIds, and clientEmail are required' });
  }

  const orderResult = await sql`
    INSERT INTO orders (gallery_id, status, fulfillment_type, product_details, customer_email, amount_total)
    VALUES (
      ${galleryId}, 'paid', 'direct',
      ${JSON.stringify({ cart: [{ key: 'direct_delivery', mediaIds }] })},
      ${clientEmail}, 0
    )
    RETURNING id;
  `;
  const orderId = orderResult.rows[0].id;

  const downloadUrl = `https://${req.headers.host}/api/download-order?orderId=${orderId}`;

  const attachments = [
    { filename: 'matt-crawford-content-license-agreement.pdf', content: LICENSE_AGREEMENT_PDF_BASE64 },
  ];
  if (invoicePdfBase64) {
    attachments.push({
      filename: invoicePdfFilename || 'invoice.pdf',
      content: invoicePdfBase64,
    });
  }

  await resend.emails.send({
    from: 'Matt Crawford <orders@matt-crawford.com>',
    to: clientEmail,
    subject: 'Your footage is ready to download',
    html: buildDownloadEmailHtml({
      downloadUrl,
      invoiceUrl: null,
      tagLabel: 'Delivery Ready',
      heading: 'Your Footage<br>Is Ready',
      bodyText: 'Thanks for the opportunity to shoot this for you — everything has been combined into one download below.',
      mentionLicense: true,
    }),
    attachments,
  });

  res.status(200).json({ success: true, orderId });
}
