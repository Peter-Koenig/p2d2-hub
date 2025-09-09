import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { url, method = "GET", body: requestBody, params = {} } = await request.json();

    // Validate URL
    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid URL parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // WFS Credentials (aus Environment oder hardcoded als Fallback)
    const WFS_USERNAME = import.meta.env.WFST_USERNAME || "p2d2_wfs_user";
    const WFS_PASSWORD = import.meta.env.WFST_PASSWORD || "eif1nu4ao9Loh0oobeev";

    // Prepare headers
    const headers = new Headers();
    headers.set("Authorization", `Basic ${btoa(`${WFS_USERNAME}:${WFS_PASSWORD}`)}`);

    if (requestBody) {
      headers.set("Content-Type", "application/xml");
    }

    // Build request options
    const requestOptions: RequestInit = {
      method: method.toUpperCase(),
      headers,
      credentials: "include" as RequestCredentials,
    };

    // Add body for POST requests
    if (method.toUpperCase() === "POST" && requestBody) {
      requestOptions.body = requestBody;
    }

    // Make the request to WFS endpoint
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("WFS Proxy Error:", response.status, errorText);

      return new Response(
        JSON.stringify({
          error: `WFS request failed: ${response.status} ${response.statusText}`,
          details: errorText
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Return successful response
    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });

  } catch (error) {
    console.error("WFS Proxy Internal Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};

export const OPTIONS: APIRoute = async () => {
  // Handle preflight requests
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
};

// Helper function to handle GET requests for simple WFS queries
export const GET: APIRoute = async ({ url }) => {
  const targetUrl = new URL(url).searchParams.get("url");

  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: "Missing url query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Forward to POST handler with GET method
  return POST({
    request: new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, method: "GET" })
    })
  } as any);
};
