// Shared auth helpers for the admin CMS.
//
// We don't use a JWT library — Node's built-in crypto is enough for an
// HMAC-signed session cookie. The cookie value is:
//
//     base64url(payload) + "." + base64url(hmacSHA256(SESSION_SECRET, payload))
//
// On every protected request we recompute the HMAC and compare in
// constant time. If it matches and `exp` is in the future, the session
// is valid.
//
// Env vars used:
//   ADMIN_EMAIL       — the single editor's email
//   ADMIN_PASSWORD    — plaintext password (Vercel encrypts env vars at rest)
//   SESSION_SECRET    — long random string for HMAC signing

import crypto from "node:crypto";

const COOKIE_NAME = "mt_admin";
// 8 hours — long enough for an editing session, short enough to limit damage
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  );
}

function hmac(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

// Create a signed cookie value for the given session payload.
export function signSession(payload, secret) {
  const data = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(hmac(secret, data));
  return `${data}.${sig}`;
}

// Verify a cookie string. Returns the payload object or null.
export function verifySession(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;

  // Constant-time compare to prevent timing attacks
  const expected = hmac(secret, data);
  let provided;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(data).toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

// Build a Set-Cookie header value that issues the session.
export function buildSessionCookieHeader(cookieValue) {
  const maxAge = SESSION_TTL_SECONDS;
  return [
    `${COOKIE_NAME}=${cookieValue}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

// Build a Set-Cookie header value that clears the session.
export function buildClearCookieHeader() {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ].join("; ");
}

// Parse the request's Cookie header and return our cookie value, or null.
export function readSessionCookie(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(/;\s*/)) {
    const [name, ...rest] = part.split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }
  return null;
}

// Constant-time string compare for password verification.
export function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ab.length !== bb.length) {
    // Still do a fake compare to keep timing constant
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

// Helper: enforce a valid session, otherwise send 401 and return null.
// Returns the session payload if valid.
export function requireSession(req, res) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: "SESSION_SECRET not configured" });
    return null;
  }
  const cookie = readSessionCookie(req);
  const session = verifySession(cookie, secret);
  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return session;
}

export const SESSION_CONSTANTS = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
};
