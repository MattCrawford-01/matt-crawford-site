import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';
import crypto from 'crypto';

// Copies every photo/video from an existing gallery into a brand new one — no
// re-uploading. Only new database rows are created (same blob_url/thumb_url), so the
// underlying files are shared, not duplicated in storage.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { sourceGalleryId, clientName, clientBusiness, clientEmail } = req.body;

  if (!sourceGalleryId || !clientName || !clientEmail) {
    return res.status(400).json({ error: 'sourceGalleryId, clientName, and clientEmail are required' });
  }

  const sourceMedia = await sql`
    SELECT type, blob_url, thumb_url, filename, file_size_bytes, width_px, height_px, sort_order
    FROM media WHERE gallery_id = ${sourceGalleryId} ORDER BY sort_order ASC;
  `;

  if (sourceMedia.rows.length === 0) {
    return res.status(404).json({ error: 'Source gallery has no media, or does not exist' });
  }

  const slug = crypto.randomBytes(6).toString('hex');

  const newGalleryResult = await sql`
    INSERT INTO galleries (slug, client_name, client_business, client_email)
    VALUES (${slug}, ${clientName}, ${clientBusiness || null}, ${clientEmail})
    RETURNING id, slug;
  `;
  const newGallery = newGalleryResult.rows[0];

  for (const m of sourceMedia.rows) {
    await sql`
      INSERT INTO media (gallery_id, type, blob_url, thumb_url, filename, file_size_bytes, width_px, height_px, sort_order)
      VALUES (${newGallery.id}, ${m.type}, ${m.blob_url}, ${m.thumb_url}, ${m.filename}, ${m.file_size_bytes}, ${m.width_px}, ${m.height_px}, ${m.sort_order});
    `;
  }

  const galleryUrl = `https://${req.headers.host}/gallery.html?g=${newGallery.slug}`;

  res.status(200).json({
    galleryId: newGallery.id,
    slug: newGallery.slug,
    galleryUrl,
    mediaCopied: sourceMedia.rows.length,
  });
}
