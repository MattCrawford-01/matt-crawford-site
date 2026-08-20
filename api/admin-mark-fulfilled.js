import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  await sql`UPDATE orders SET fulfilled_at = now() WHERE id = ${orderId};`;

  res.status(200).json({ success: true });
}
