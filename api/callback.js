// /api/callback — completes the GitHub OAuth flow for Decap CMS
//
// GitHub redirects the user here with a temporary `code`. We
// exchange it for a permanent access_token, then perform Decap's
// expected handshake with the opener window:
//   1. popup → opener  : "authorizing:github"
//   2. opener → popup  : "authorizing:github"  (Decap's ack)
//   3. popup → opener  : "authorization:github:success:{token,provider}"
//      (or "authorization:github:error:{...}" on failure)
//   4. popup closes

export default async function handler(req, res) {
  const { code } = req.query;
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res
      .status(500)
      .send(
        "OAUTH_CLIENT_ID or OAUTH_CLIENT_SECRET not set in Vercel env vars."
      );
    return;
  }

  if (!code) {
    res.status(400).send("Missing `code` query parameter.");
    return;
  }

  let payload;
  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "mahavirtrust-cms-oauth-proxy",
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

    if (error || !token) {
      payload = `authorization:github:error:${JSON.stringify({
        error: error || "no_token_returned",
        description:
          data.error_description ||
          "GitHub did not return a token. Check that OAUTH_CLIENT_ID/SECRET match the OAuth App, and that the OAuth App's callback URL is exactly the URL you came back to.",
      })}`;
    } else {
      payload = `authorization:github:success:${JSON.stringify({
        token,
        provider: "github",
      })}`;
    }
  } catch (err) {
    payload = `authorization:github:error:${JSON.stringify({
      error: "fetch_failed",
      description: String(err && err.message ? err.message : err),
    })}`;
  }

  // Serialize payload safely for embedding in HTML/JS
  const safePayload = JSON.stringify(payload);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Authorizing…</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #FAF6EE; color: #0E0E0E; }
    code { background: rgba(0,0,0,.06); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    .err { color: #B7472A; margin-top: 20px; }
  </style>
</head>
<body>
  <p id="status">Authorizing… you can close this window if it doesn't close itself.</p>
  <p id="errdetail" class="err" style="display:none"></p>
  <script>
    (function () {
      var payload = ${safePayload};
      var sent = false;

      function sendPayload() {
        if (sent) return;
        if (!window.opener) {
          // No opener — show error inline so user knows something's off
          document.getElementById('status').textContent = 'OAuth completed but no opener window was found. Close this and try logging in again.';
          return;
        }
        try {
          window.opener.postMessage(payload, '*');
          sent = true;
        } catch (e) {
          var d = document.getElementById('errdetail');
          d.style.display = 'block';
          d.textContent = 'postMessage failed: ' + e.message;
        }
      }

      // 1) Listen for Decap's handshake reply.
      function onMessage(e) {
        if (typeof e.data !== 'string') return;
        if (e.data.indexOf('authorizing:github') !== 0) return;
        sendPayload();
        window.removeEventListener('message', onMessage);
        setTimeout(function () {
          try { window.close(); } catch (_) {}
        }, 200);
      }
      window.addEventListener('message', onMessage);

      // 2) Announce ourselves so Decap knows the popup is ready.
      if (window.opener) {
        try { window.opener.postMessage('authorizing:github', '*'); } catch (_) {}
      }

      // 3) Safety net: if Decap never responds within 2s, send anyway
      //    (covers cases where the popup loads before Decap registers
      //    its message listener).
      setTimeout(sendPayload, 2000);
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
