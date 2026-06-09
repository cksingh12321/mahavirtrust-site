// POST /api/admin-login
//
// Request body (JSON or form-encoded): { email, password }
//
// On success: 204 No Content + Set-Cookie with signed session.
// On failure: 401 with generic error (no hints about which field is wrong).
//
// Env vars:
//   ADMIN_EMAIL      — the single editor's email (compared case-insensitive)
//   ADMIN_PASSWORD   — plaintext password (Vercel encrypts env vars at rest)
//   SESSION_SECRET   — long random string for HMAC

import {
  signSession,
  buildSessionCookieHeader,
  timingSafeStringEqual,
  SESSION_CONSTANTS,
} from "./_lib/session.js";

async function readBody(req) {
  // Vercel's Node runtime gives us a stream, not a parsed body
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  raw = raw.trim();
  if (!raw) return {};
  // Accept JSON or form-encoded
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // .trim() guards against a trailing space / newline accidentally
  // pasted into the Vercel env var, which would otherwise make every
  // login fail with a confusing "invalid password".
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim();
  const adminPassword = (process.env.ADMIN_PASSWORD || "").trim();
  const secret = process.env.SESSION_SECRET;

  if (!adminEmail || !adminPassword || !secret) {
    res.status(500).json({
      error:
        "Server not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD and SESSION_SECRET in Vercel.",
    });
    return;
  }

  const body = await readBody(req);
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "").trim();

  // Two compares in constant time so we don't leak which field was wrong
  const emailOk = timingSafeStringEqual(email, adminEmail.toLowerCase());
  const passOk = timingSafeStringEqual(password, adminPassword);

  if (!emailOk || !passOk) {
    // TEMPORARY: emailOk/passOk help diagnose a failing login (which field
    // mismatches the Vercel env var). Remove once sign-in works.
    res.status(401).json({ error: "Invalid email or password", emailOk, passOk });
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: email,
    iat: now,
    exp: now + SESSION_CONSTANTS.SESSION_TTL_SECONDS,
  };
  const cookieValue = signSession(payload, secret);

  res.setHeader("Set-Cookie", buildSessionCookieHeader(cookieValue));
  res.status(204).end();
}
