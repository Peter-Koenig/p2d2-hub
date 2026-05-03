// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import type { APIRoute } from "astro";
import { createChallenge } from "altcha-lib";
import { ALTCHA_HMAC_KEY, APP_DEBUG } from "astro:env/server";

export const GET: APIRoute = async () => {
  try {
    // Get HMAC key from environment (required)
    const hmacKey = ALTCHA_HMAC_KEY;
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
    const challengeData = await createChallenge({
      algorithm: "SHA-256",
      maxnumber: 50000,
      hmacKey,
    });

    // Filter response: Only send fields that the widget expects
    // DO NOT include "maxnumber" in the response!
    const response = {
      algorithm: challengeData.algorithm,
      challenge: challengeData.challenge,
      salt: challengeData.salt,
      signature: challengeData.signature,
    };

    // Debug logging
    if (APP_DEBUG) {
      console.log("🔍 Challenge created:", {
        algorithm: response.algorithm,
        challengeLength: response.challenge?.length || 0,
        saltLength: response.salt?.length || 0,
        signatureLength: response.signature?.length || 0,
      });
    }

    // Return filtered challenge as JSON
    return new Response(JSON.stringify(response), {
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
