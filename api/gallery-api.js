import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Missing gallery slug' });

  const galleryResult = await sql`
    SELECT id, client_name, client_business, expires_at
    FROM galleries WHERE slug = ${slug};
  `;

  if (galleryResult.rows.length === 0) {
    return res.status(404).json({ error: 'Gallery not found' });
  }

  const gallery = galleryResult.rows[0];

  if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) {
    return res.status(410).json({ error: 'This gallery link has expired' });
  }

  const mediaResult = await sql`
    SELECT id, type, thumb_url, blob_url, filename, width_px, height_px FROM media
    WHERE gallery_id = ${gallery.id}
    ORDER BY sort_order ASC;
  `;

  res.status(200).json({
    galleryId: gallery.id,
    clientName: gallery.client_name,
    clientBusiness: gallery.client_business,
    media: mediaResult.rows,
  });
}
