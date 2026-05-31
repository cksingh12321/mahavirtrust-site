// /api/auth — initiates GitHub OAuth for Decap CMS
//
// Decap CMS opens this URL in a popup. We redirect the user to
// GitHub's authorization screen. After they approve, GitHub
// redirects them back to /api/callback with a temporary `code`,
// which we exchange for an access_token there.
//
// IMPORTANT: the redirect_uri sent here MUST exactly match the
// "Authorization callback URL" registered on the GitHub OAuth App.
// We hardcode the canonical (www) domain so the OAuth flow works
// even if the user reached /admin via the apex domain.

const CANONICAL_CALLBACK_URL =
  "https://www.mahavirtrust.org/api/callback";

export default function handler(req, res) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  if (!clientId) {
    res
      .status(500)
      .send(
        "OAUTH_CLIENT_ID not set. Set it in Vercel → Project → Settings → Environment Variables."
      );
    return;
  }

  // `repo` scope = read+write access to repo content (so Decap can commit).
  // `user:email` = identifies the editor (shown in commit author).
  const scope = "repo,user:email";

  const githubAuthUrl =
    "https://github.com/login/oauth/authorize" +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(CANONICAL_CALLBACK_URL)}` +
    `&scope=${encodeURIComponent(scope)}`;

  res.writeHead(302, { Location: githubAuthUrl });
  res.end();
}
