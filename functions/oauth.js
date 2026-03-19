/**
 * IdeaPitch OAuth Proxy — Cloudflare Worker
 *
 * This Worker acts as a secure proxy to exchange a GitHub OAuth code
 * for an access token without exposing the client secret.
 *
 * It does NOT store, log, or forward the token anywhere.
 * The token is returned directly to the user's browser.
 *
 * Source: https://github.com/ideapitch/ideapitch.github.io
 */

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const origin         = request.headers.get("Origin") || "";
  const allowedOrigins = ["https://ideapitch.github.io"];
  const allowed        = allowedOrigins.includes(origin);

  const corsHeaders = {
    "Access-Control-Allow-Origin":  allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: corsHeaders,
    });
  }

  const url  = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response(JSON.stringify({ error: "No code provided" }), {
      status: 400, headers: corsHeaders,
    });
  }

  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id:     GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const data = await res.json();

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error_description || data.error }), {
        status: 400, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });
  } catch {
    return new Response(JSON.stringify({ error: "Auth failed" }), {
      status: 500, headers: corsHeaders,
    });
  }
}
