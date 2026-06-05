// GET /api/admin-session
//
// Tiny helper used by the dashboard JS to check if we're still logged in
// on page load. Returns { email } on success, 401 otherwise.

import { requireSession } from "./_lib/session.js";

export default function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return; // requireSession already sent 401
  res.status(200).json({ email: session.sub });
}
