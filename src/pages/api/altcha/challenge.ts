import type { APIRoute } from "astro";
import { createChallenge } from "altcha-lib";

export const GET: APIRoute = async () => {
  try {
    // Get HMAC key from environment (required)
    const hmacKey = process.env.ALTCHA_HMAC_KEY;
    if (!hmacKey) {
      console.error("ALTCHA_HMAC_KEY environment variable is not set");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create challenge with specified parameters
    const challenge = createChallenge({
      algorithm: "SHA-256",
      maxnumber: 50000,
      hmacKey,
    });

    // Return challenge as JSON
    return new Response(JSON.stringify(challenge), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error generating ALTCHA challenge:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
