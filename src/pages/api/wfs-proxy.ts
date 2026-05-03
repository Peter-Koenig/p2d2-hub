// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";

/**
 * WFS Proxy for CORS bypass
 *
 * Read access (GET): Anonymous - no credentials required
 * Write access (POST with body): Requires explicit credentials in request
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const {
      url,
      method = "GET",
      body: requestBody,
      params = {},
    } = await request.json();

    // Validate URL
    if (!url || typeof url !== "string") {
      console.error("[WFS-PROXY-DEBUG] Invalid URL parameter:", url);
      return new Response(
        JSON.stringify({ error: "Missing or invalid URL parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate that URL is from trusted WFS endpoints
    const allowedHosts = ["wfs.data-dna.eu", "ows.data-dna.eu"];
    const urlHost = new URL(url).hostname;

    if (!allowedHosts.includes(urlHost)) {
      console.error("[WFS-PROXY-DEBUG] Untrusted endpoint:", urlHost);
      return new Response(JSON.stringify({ error: "Untrusted WFS endpoint" }), {
        status: 403,
      });
    }

    // Prepare headers
    const headers = new Headers();

    // Only add Authorization header if credentials are explicitly provided in request
    // For anonymous read access, no Authorization header is set
    const authUsername = params.username as string | undefined;
    const authPassword = params.password as string | undefined;

    if (authUsername && authPassword) {
      headers.set(
        "Authorization",
        `Basic ${btoa(`${authUsername}:${authPassword}`)}`,
      );
    }

    if (requestBody) {
      headers.set("Content-Type", "application/xml");
    }

    // Build request options
    const requestOptions: RequestInit = {
      method: method.toUpperCase(),
      headers,
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
          details: errorText,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Return successful response
    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("WFS Proxy Internal Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
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
      "Access-Control-Max-Age": "86400",
    },
  });
};

// Helper function to handle GET requests for simple WFS queries
export const GET: APIRoute = async ({ url }) => {
  const targetUrl = new URL(url).searchParams.get("url");

  if (!targetUrl) {
    console.error("[WFS-PROXY-DEBUG] Missing url query parameter");
    return new Response(
      JSON.stringify({ error: "Missing url query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate that URL is from trusted WFS endpoints
  const allowedHosts = ["wfs.data-dna.eu", "ows.data-dna.eu"];
  try {
    const urlHost = new URL(targetUrl).hostname;
    if (!allowedHosts.includes(urlHost)) {
      console.error("[WFS-PROXY-DEBUG] Untrusted endpoint:", urlHost);
      return new Response(JSON.stringify({ error: "Untrusted WFS endpoint" }), {
        status: 403,
      });
    }
  } catch (error) {
    console.error("[WFS-PROXY-DEBUG] Invalid target URL:", targetUrl);
    return new Response(JSON.stringify({ error: "Invalid target URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Direct anonymous GET request - no credentials required for read access
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: new Headers(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("WFS Proxy GET Error:", response.status, errorText);

      return new Response(
        JSON.stringify({
          error: `WFS request failed: ${response.status} ${response.statusText}`,
          details: errorText,
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Return successful response
    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch (error) {
    console.error("WFS Proxy GET Internal Error:", error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
