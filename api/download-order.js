import { sql } from '@vercel/postgres';
import archiver from 'archiver';

// This is the single link clients get in their order-confirmation email. It looks up
// everything digital they purchased, fetches each file server-side (with the storage
// token, since files are private), and streams it all back as one .zip — so clicking
// the link starts a real download instead of previewing files one at a time.
export default async function handler(req, res) {
  const { orderId } = req.query;
  if (!orderId) {
    return res.status(400).send('Missing order');
  }

  const orderResult = await sql`SELECT * FROM orders WHERE id = ${orderId};`;
  if (orderResult.rows.length === 0) {
    return res.status(404).send('Order not found');
  }
  const order = orderResult.rows[0];

  if (order.status !== 'paid') {
    return res.status(403).send('This order has not been paid yet.');
  }

  const cart = order.product_details.cart || [];
  const digitalItems = cart.filter(item => !item.key.startsWith('print_'));
  const mediaIds = [...new Set(digitalItems.flatMap(item => item.mediaIds))];

  if (mediaIds.length === 0) {
    return res.status(404).send('No digital files in this order.');
  }

  const mediaResult = await sql.query(
    `SELECT blob_url, filename FROM media WHERE id = ANY($1::uuid[])`,
    [mediaIds]
  );

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="your-photos-and-videos.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    // Headers are likely already sent by this point since we're streaming —
    // just end the response, there's no clean way to report an error mid-stream.
    res.end();
  });
  archive.pipe(res);

  // Guard against duplicate filenames across purchased items (two files sharing a
  // name would silently overwrite each other inside the zip otherwise).
  const usedNames = new Set();
  const uniqueName = (name) => {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const base = dot > -1 ? name.slice(0, dot) : name;
    const ext = dot > -1 ? name.slice(dot) : '';
    let i = 2;
    let candidate = `${base} (${i})${ext}`;
    while (usedNames.has(candidate)) { i++; candidate = `${base} (${i})${ext}`; }
    usedNames.add(candidate);
    return candidate;
  };

  for (const m of mediaResult.rows) {
    const fileRes = await fetch(m.blob_url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!fileRes.ok) continue; // skip anything that failed to fetch rather than aborting the whole zip
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    archive.append(buffer, { name: uniqueName(m.filename) });
  }

  await archive.finalize();
}
