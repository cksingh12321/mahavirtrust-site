// POST /api/admin-upload
//
// Receives an image (already downscaled + base64-encoded by the browser),
// commits it to assets/img/uploads/<filename> in the repo via the GitHub
// Contents API, and returns its public path.
//
// Body (JSON): { filename, contentBase64 }
//   filename       — suggested name, e.g. "event-photo.jpg" (we sanitise it)
//   contentBase64  — raw base64 of the file bytes (NO "data:" prefix)
//
// Requires a valid admin session cookie. Uses the server-side GITHUB_PAT.

import { requireSession } from "./_lib/session.js";

const DEFAULT_REPO = "cksingh12321/mahavirtrust-site";
const DEFAULT_BRANCH = "main";
const UPLOAD_DIR = "assets/img/uploads";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB after the browser's downscale

function ghHeaders(pat) {
  return {
    Authorization: `Bearer ${pat}`,
    "User-Agent": "mahavirtrust-admin",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sanitizeFilename(name) {
  const cleaned = String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 80);
  return cleaned || `photo-${Date.now()}.jpg`;
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    res.status(500).json({ error: "GITHUB_PAT not configured in Vercel." });
    return;
  }
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  const body = await readBody(req);
  const contentBase64 = String(body.contentBase64 || "").trim();
  if (!contentBase64) {
    res.status(400).json({ error: "No image data received." });
    return;
  }

  const approxBytes = Math.floor((contentBase64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    res.status(413).json({ error: "Image too large (max ~5MB)." });
    return;
  }

  const filename = sanitizeFilename(body.filename);
  const path = `${UPLOAD_DIR}/${filename}`;
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;

  try {
    // If a file with this exact name already exists, we need its sha to overwrite.
    let sha = null;
    const getR = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, {
      headers: ghHeaders(pat),
    });
    if (getR.ok) {
      const existing = await getR.json();
      sha = existing.sha || null;
    }

    const putBody = {
      message: `cms: upload ${filename}`,
      content: contentBase64,
      branch,
      committer: {
        name: "Mahavir Trust CMS",
        email: session.sub,
      },
    };
    if (sha) putBody.sha = sha;

    const putR = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(pat), "Content-Type": "application/json" },
      body: JSON.stringify(putBody),
    });
    if (!putR.ok) {
      const text = await putR.text();
      res.status(500).json({ error: `GitHub upload failed (${putR.status}): ${text}` });
      return;
    }

    res.status(200).json({ ok: true, path: `/${path}` });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
