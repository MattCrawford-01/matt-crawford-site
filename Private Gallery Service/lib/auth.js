// Simple shared-secret check for admin-only endpoints.
// Set ADMIN_PASSWORD in Vercel's Environment Variables (Settings -> Environment Variables).
export function isAuthorized(req) {
  const provided = req.headers['x-admin-password'];
  return provided && provided === process.env.ADMIN_PASSWORD;
}
