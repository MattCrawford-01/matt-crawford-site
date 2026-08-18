import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const result = await sql`
    SELECT
      g.id, g.slug, g.client_name, g.client_business, g.client_email, g.created_at,
      COUNT(m.id) AS media_count
    FROM galleries g
    LEFT JOIN media m ON m.gallery_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC;
  `;

  res.status(200).json({ galleries: result.rows });
}
