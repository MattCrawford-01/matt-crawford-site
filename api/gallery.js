import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Missing slug' });

  const galleryResult = await sql`
    SELECT id, client_name, client_business, currency FROM galleries WHERE slug = ${slug};
  `;
  if (galleryResult.rows.length === 0) {
    return res.status(404).json({ error: 'Gallery not found' });
  }
  const gallery = galleryResult.rows[0];

  const mediaResult = await sql`
    SELECT id, type, thumb_url, blob_url, filename, width_px, height_px FROM media
    WHERE gallery_id = ${gallery.id}
    ORDER BY sort_order ASC;
  `;

  res.status(200).json({
    clientName: gallery.client_name,
    clientBusiness: gallery.client_business,
    currency: gallery.currency || 'usd',
    media: mediaResult.rows,
  });
}
