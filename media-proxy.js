// Private Blob files can't be loaded directly by <img>/<video> tags — there's no way
// for a plain HTML tag to attach the auth header the storage service requires.
// This endpoint fetches the file server-side (with the token) and streams it back,
// so the browser only ever talks to our own domain.
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Only allow proxying our own Blob storage files — prevents this endpoint
  // from being used as an open proxy for arbitrary URLs.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }
  if (!parsed.hostname.endsWith('.blob.vercel-storage.com')) {
    return res.status(400).json({ error: 'URL not allowed' });
  }

  try {
    const blobRes = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });

    if (!blobRes.ok) {
      return res.status(blobRes.status).json({ error: 'Failed to fetch media' });
    }

    const contentType = blobRes.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    const arrayBuffer = await blobRes.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
