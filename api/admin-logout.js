// POST /api/admin-logout
//
// Clears the session cookie. Always returns 204.

import { buildClearCookieHeader } from "./_lib/session.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", buildClearCookieHeader());
  res.status(204).end();
}
