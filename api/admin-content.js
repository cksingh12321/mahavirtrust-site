// /api/admin-content
//
//   GET  /api/admin-content?collection=news      → returns current entries
//   PUT  /api/admin-content?collection=news      → body { entries: [...] }
//
// Reads and writes the JSON file in the repo via the GitHub Contents API,
// using a server-side personal access token (GITHUB_PAT) that never
// reaches the browser.
//
// All requests must include a valid session cookie issued by /api/admin-login.
//
// Env vars:
//   GITHUB_PAT        — GitHub personal access token with `repo` scope
//   GITHUB_REPO       — e.g. "cksingh12321/mahavirtrust-site"   (optional, default below)
//   GITHUB_BRANCH     — e.g. "main"                              (optional, default below)
//   SESSION_SECRET    — used by requireSession()

import { requireSession } from "./_lib/session.js";

const DEFAULT_REPO = "cksingh12321/mahavirtrust-site";
const DEFAULT_BRANCH = "main";

// Whitelist of editable collections. Anything else returns 400.
const COLLECTIONS = {
  news: "content/news.json",
  blog: "content/blog.json",
  press: "content/press.json",
};

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

// Fetch the current file (content + sha) from GitHub
async function getFile(repo, branch, path, pat) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const r = await fetch(url, { headers: ghHeaders(pat) });
  if (r.status === 404) return { sha: null, json: { entries: [] } };
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub GET failed (${r.status}): ${text}`);
  }
  const data = await r.json();
  const decoded = Buffer.from(data.content || "", "base64").toString("utf8");
  let json = { entries: [] };
  try {
    json = JSON.parse(decoded);
    if (!json || !Array.isArray(json.entries)) json = { entries: [] };
  } catch {
    json = { entries: [] };
  }
  return { sha: data.sha, json };
}

// Commit a new version of the file. If sha is null, this is a create.
async function putFile(repo, branch, path, pat, newContent, sha, message, author) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const body = {
    message,
    content: Buffer.from(newContent, "utf8").toString("base64"),
    branch,
    committer: {
      name: author?.name || "Mahavir Trust CMS",
      email: author?.email || "cms@mahavirtrust.org",
    },
  };
  if (sha) body.sha = sha;

  const r = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub PUT failed (${r.status}): ${text}`);
  }
  return await r.json();
}

export default async function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const pat = process.env.GITHUB_PAT;
  if (!pat) {
    res.status(500).json({
      error: "GITHUB_PAT not configured. Set it in Vercel env vars.",
    });
    return;
  }
  const repo = process.env.GITHUB_REPO || DEFAULT_REPO;
  const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;

  // ?collection=news|blog|press
  const url = new URL(req.url, "https://placeholder.local");
  const collection = url.searchParams.get("collection");
  const filePath = COLLECTIONS[collection];
  if (!filePath) {
    res.status(400).json({
      error: `Unknown collection. Allowed: ${Object.keys(COLLECTIONS).join(", ")}`,
    });
    return;
  }

  try {
    if (req.method === "GET") {
      const { json } = await getFile(repo, branch, filePath, pat);
      res.status(200).json(json);
      return;
    }

    if (req.method === "PUT") {
      const body = await readBody(req);
      const entries = Array.isArray(body.entries) ? body.entries : null;
      if (!entries) {
        res.status(400).json({ error: "Body must be { entries: [...] }" });
        return;
      }

      // Fetch current sha (required by GitHub for updates)
      const { sha } = await getFile(repo, branch, filePath, pat);

      const newContent = JSON.stringify({ entries }, null, 2) + "\n";
      const message = `cms: update ${collection}.json (${entries.length} entries)`;

      const result = await putFile(repo, branch, filePath, pat, newContent, sha, message, {
        name: "Mahavir Trust CMS",
        email: session.sub,
      });

      res.status(200).json({
        ok: true,
        commit: result?.commit?.sha?.slice(0, 7) || null,
        count: entries.length,
      });
      return;
    }

    res.setHeader("Allow", "GET, PUT");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
