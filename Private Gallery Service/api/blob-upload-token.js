import { handleUpload } from '@vercel/blob/client';
import { isAuthorized } from '../lib/auth.js';

// This endpoint lets the browser upload large files (video) directly to Vercel Blob,
// bypassing the serverless function body size limit entirely. The browser calls this
// first to get a signed token, then uploads straight to Blob storage.
export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'],
          addRandomSuffix: true,
          maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5GB ceiling per file
        };
      },
      onUploadCompleted: async () => {
        // Intentionally empty — the browser registers the DB row itself via
        // /api/admin-register-media after the direct upload finishes.
      },
    });
    res.status(200).json(jsonResponse);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
