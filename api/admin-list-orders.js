import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Only paid orders — a checkout someone started but never completed isn't something
  // you need to fulfill, so there's no reason to clutter this view with it.
  const result = await sql`
    SELECT
      o.id, o.status, o.fulfillment_type, o.product_details, o.shipping_address,
      o.amount_total, o.customer_email, o.invoice_url, o.created_at, o.fulfilled_at,
      g.client_name, g.client_business
    FROM orders o
    LEFT JOIN galleries g ON g.id = o.gallery_id
    WHERE o.status = 'paid'
    ORDER BY o.created_at DESC;
  `;

  res.status(200).json({ orders: result.rows });
}
