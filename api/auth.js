// /api/auth — initiates GitHub OAuth for Decap CMS
//
// Decap CMS opens this URL in a popup. We redirect the user to
// GitHub's authorization screen. After they approve, GitHub
// redirects them back to /api/callback with a temporary `code`,
// which we exchange for an access_token there.

export default function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(500).send(
      "OAUTH_CLIENT_ID not set. Set it in Vercel → Project → Settings → Environment Variables."
    );
    return;
  }

  // GitHub will redirect back here after the user approves.
  // Must match the "Authorization callback URL" set on the GitHub OAuth App.
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const redirectUri = `${proto}://${host}/api/callback`;

  // `repo` scope = read+write access to repo content (so Decap can commit).
  // `user:email` = identifies the editor (shown in commit author).
  const scope = "repo,user:email";

  const githubAuthUrl =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}`;

  res.writeHead(302, { Location: githubAuthUrl });
  res.end();
}
