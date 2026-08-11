import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { clientName, clientBusiness, clientEmail } = req.body;
  if (!clientName || !clientEmail) {
    return res.status(400).json({ error: 'clientName and clientEmail are required' });
  }

  const slug = crypto.randomBytes(6).toString('hex'); // e.g. "8f3a1c9e2b7d"

  const result = await sql`
    INSERT INTO galleries (slug, client_name, client_business, client_email)
    VALUES (${slug}, ${clientName}, ${clientBusiness || null}, ${clientEmail})
    RETURNING id, slug;
  `;

  const gallery = result.rows[0];
  const galleryUrl = `https://${req.headers.host}/gallery.html?g=${gallery.slug}`;

  res.status(200).json({ galleryId: gallery.id, slug: gallery.slug, galleryUrl });
}
