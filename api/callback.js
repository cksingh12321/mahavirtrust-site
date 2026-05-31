// /api/callback — completes the GitHub OAuth flow for Decap CMS
//
// GitHub redirects the user here with a temporary `code`. We
// exchange it for a permanent access_token, then post the token
// back to the opener window (the Decap CMS popup) via
// window.postMessage, in the exact format Decap expects.

export default async function handler(req, res) {
  const { code } = req.query;
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).send(
      "OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET not set. Set both in Vercel → Project → Settings → Environment Variables."
    );
    return;
  }

  if (!code) {
    res.status(400).send("Missing `code` query parameter.");
    return;
  }

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      }
    );

    const data = await tokenResponse.json();
    const token = data.access_token;
    const error = data.error;

    let payload;
    if (error || !token) {
      payload = `authorization:github:error:${JSON.stringify({
        error: error || "no_token_returned",
        description: data.error_description || "GitHub did not return a token.",
      })}`;
    } else {
      payload = `authorization:github:success:${JSON.stringify({
        token,
        provider: "github",
      })}`;
    }

    // Tiny HTML page that messages the parent (the Decap popup opener)
    // and then closes itself. This is the protocol Decap expects.
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Authorizing…</title>
  <style>body{font-family:system-ui,sans-serif;padding:40px;background:#FAF6EE;color:#0E0E0E;}</style>
</head>
<body>
  <p>Authorizing… you can close this window if it doesn't close itself.</p>
  <script>
    (function() {
      function send() {
        if (!window.opener) return;
        window.opener.postMessage(${JSON.stringify(payload)}, "*");
      }
      // Decap first sends 'authorizing:github' to us; reply when we hear that.
      window.addEventListener("message", function(e) {
        if (typeof e.data === "string" && e.data.indexOf("authorizing:github") === 0) {
          send();
          window.removeEventListener("message", arguments.callee);
          setTimeout(function() { window.close(); }, 500);
        }
      });
      // Also send immediately in case Decap is already listening
      send();
    })();
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  } catch (err) {
    res.status(500).send("OAuth exchange failed: " + (err.message || err));
  }
}
