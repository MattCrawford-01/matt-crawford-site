import { sql } from '@vercel/postgres';
import { del } from '@vercel/blob';
import { isAuthorized } from '../lib/auth.js';

// Deletes a gallery entirely: the actual files in Blob storage, the media rows, and the
// gallery row itself. Refuses to delete if the gallery has any orders attached — those
// need to stay intact for your own sales/tax records even after a gallery is retired.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { galleryId } = req.body;
  if (!galleryId) {
    return res.status(400).json({ error: 'galleryId is required' });
  }

  const orderCountResult = await sql`
    SELECT COUNT(*) AS count FROM orders WHERE gallery_id = ${galleryId};
  `;
  const orderCount = parseInt(orderCountResult.rows[0].count, 10);

  if (orderCount > 0) {
    return res.status(409).json({
      error: `This gallery has ${orderCount} order${orderCount === 1 ? '' : 's'} attached and can't be deleted, to keep your sales records intact.`,
    });
  }

  const mediaResult = await sql`SELECT blob_url, thumb_url FROM media WHERE gallery_id = ${galleryId};`;

  // Delete the actual files from storage. Best-effort — if an individual file is
  // already gone or fails to delete, keep going rather than abandon the whole cleanup.
  const urlsToDelete = mediaResult.rows.flatMap(m => [m.blob_url, m.thumb_url]).filter(Boolean);
  for (const url of urlsToDelete) {
    try {
      await del(url);
    } catch (err) {
      // Non-fatal — continue removing the rest.
    }
  }

  // Deletes the gallery row; media rows cascade-delete automatically (ON DELETE CASCADE).
  await sql`DELETE FROM galleries WHERE id = ${galleryId};`;

  res.status(200).json({ success: true, filesDeleted: urlsToDelete.length });
}
