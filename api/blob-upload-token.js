import { handleUpload } from '@vercel/blob/client';

// This endpoint lets the browser upload large files (video) directly to Vercel Blob,
// bypassing the serverless function body size limit entirely. The browser calls this
// first to get a signed token, then uploads straight to Blob storage.
//
// Auth note: the admin password is sent via clientPayload (a string the browser SDK
// passes through to this callback) rather than a request header, since custom headers
// aren't supported on this particular request.
export default async function handler(req, res) {
  const body = req.body;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try { payload = JSON.parse(clientPayload || '{}'); } catch {}
        if (payload.adminPassword !== process.env.ADMIN_PASSWORD) {
          throw new Error('Unauthorized');
        }
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
