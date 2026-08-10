import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { galleryId, type, blobUrl, thumbUrl, filename, fileSizeBytes } = req.body;

  if (!galleryId || !type || !blobUrl || !thumbUrl || !filename) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (type !== 'photo' && type !== 'video') {
    return res.status(400).json({ error: 'type must be "photo" or "video"' });
  }

  const maxOrder = await sql`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM media WHERE gallery_id = ${galleryId};
  `;

  await sql`
    INSERT INTO media (gallery_id, type, blob_url, thumb_url, filename, file_size_bytes, sort_order)
    VALUES (${galleryId}, ${type}, ${blobUrl}, ${thumbUrl}, ${filename}, ${fileSizeBytes || null}, ${maxOrder.rows[0].next});
  `;

  res.status(200).json({ success: true });
}
