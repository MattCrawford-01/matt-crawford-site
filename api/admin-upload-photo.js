import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { isAuthorized } from '../lib/auth.js';

// Expects multipart handled client-side via fetch() sending raw file bytes,
// with gallery ID and filename passed as query params.
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { galleryId, filename } = req.query;
  if (!galleryId || !filename) {
    return res.status(400).json({ error: 'galleryId and filename are required' });
  }

  // Full resolution original
  const fullBlob = await put(`galleries/${galleryId}/full-${filename}`, req, {
    access: 'public',
    addRandomSuffix: true,
  });

  // NOTE: thumbnail generation happens client-side before upload (see admin.html) —
  // this endpoint is called twice per photo: once for the full file, once for the thumb,
  // distinguished by a "kind" query param.
  const { kind } = req.query;

  if (kind === 'thumb') {
    // Store thumb URL against the most recently inserted photo row for this gallery
    // (admin.html uploads full first, then thumb, using the same filename to correlate)
    await sql`
      UPDATE photos SET thumb_url = ${fullBlob.url}
      WHERE gallery_id = ${galleryId} AND filename = ${filename};
    `;
    return res.status(200).json({ url: fullBlob.url });
  }

  const maxOrder = await sql`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM photos WHERE gallery_id = ${galleryId};
  `;

  await sql`
    INSERT INTO photos (gallery_id, blob_url, thumb_url, filename, sort_order)
    VALUES (${galleryId}, ${fullBlob.url}, ${fullBlob.url}, ${filename}, ${maxOrder.rows[0].next});
  `;

  res.status(200).json({ url: fullBlob.url });
}
