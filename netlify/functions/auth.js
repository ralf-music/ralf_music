// Netlify Function: GitHub OAuth for Decap/Netlify CMS
// Env vars required: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
// Flow:
//   1) If no ?code param -> redirect to GitHub authorize
//   2) If ?code present  -> exchange for access_token, then redirect to /admin/#access_token=...&provider=github
export async function handler(event, context) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  const host = event.headers["x-forwarded-host"] || event.headers.host;
  const proto = (event.headers["x-forwarded-proto"] || "https");
  const base = `${proto}://${host}`;
  const redirectUri = `${base}/.netlify/functions/auth`;

  const url = new URL(event.rawUrl || `${base}${event.path}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";

  if (!code) {
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", "repo");
    authorize.searchParams.set("state", state || Math.random().toString(36).slice(2));
    return {
      statusCode: 302,
      headers: { Location: authorize.toString() }
    };
  }

  // Exchange code for token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri
    })
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "oauth_failed", details: tokenJson })
    };
  }

  const adminUrl = `${base}/admin/#access_token=${tokenJson.access_token}&provider=github`;
  return {
    statusCode: 302,
    headers: { Location: adminUrl }
  };
}
