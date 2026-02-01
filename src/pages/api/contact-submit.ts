import type { APIRoute } from "astro";
import { verifySolution } from "altcha-lib";
import nodemailer from "nodemailer";
import {
  ALTCHA_HMAC_KEY,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  CONTACT_EMAIL_FROM,
  CONTACT_EMAIL_TO,
  APP_DEBUG,
} from "astro:env/server";

// Rate limiting map
const rateLimiter = new Map<string, number>();

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Get HMAC key from environment
    const hmacKey = ALTCHA_HMAC_KEY;
    if (!hmacKey) {
      console.error("ALTCHA_HMAC_KEY environment variable is not set");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Parse and validate input
    const data = await request.json();
    const name = data.name?.trim();
    const email = data.email?.trim();
    const subject = data.subject?.trim();
    const message = data.message?.trim();
    const altcha = data.altcha;

    // Debug logging
    if (APP_DEBUG) {
      console.debug("Contact form data received:", {
        name: name || "empty",
        email: email || "empty",
        subject: subject || "empty",
        message: message ? `length: ${message.length}` : "empty",
        hasAltcha: !!altcha,
        altchaLength: altcha ? altcha.length : 0,
      });
    }

    // Validate required fields
    if (!name || !email || !subject || !message || !altcha) {
      if (APP_DEBUG) {
        console.debug("Missing required fields:", {
          missingName: !name,
          missingEmail: !email,
          missingSubject: !subject,
          missingMessage: !message,
          missingAltcha: !altcha,
        });
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: "Alle Pflichtfelder müssen ausgefüllt sein",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Ungültige E-Mail-Adresse" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Length limits
    if (name.length > 100) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Name darf maximal 100 Zeichen lang sein",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (email.length > 254) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "E-Mail darf maximal 254 Zeichen lang sein",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (subject.length > 200) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Betreff darf maximal 200 Zeichen lang sein",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (message.length > 5000) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nachricht darf maximal 5000 Zeichen lang sein",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Verify ALTCHA solution
    try {
      const isValid = await verifySolution(altcha, hmacKey);
      if (!isValid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "CAPTCHA-Validierung fehlgeschlagen",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch (verifyError) {
      console.error("ALTCHA verification error:", verifyError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "CAPTCHA-Validierung fehlgeschlagen",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Rate limiting
    const forwardedHeader = request.headers.get("x-forwarded-for");
    const clientIP = forwardedHeader?.split(",")[0].trim() || "unknown";
    const lastSubmit = rateLimiter.get(clientIP) || 0;
    const now = Date.now();

    if (now - lastSubmit < 60000) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Bitte warte 1 Minute zwischen Absendungen",
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    rateLimiter.set(clientIP, now);

    // 5. Send email via SMTP
    try {
      // Check required SMTP environment variables
      if (
        !SMTP_HOST ||
        !SMTP_USER ||
        !SMTP_PASS ||
        !CONTACT_EMAIL_FROM ||
        !CONTACT_EMAIL_TO
      ) {
        console.error("Missing required SMTP environment variables");
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Email-Konfiguration fehlt. Bitte kontaktiere den Administrator.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      console.log("🔍 SMTP Debug Config:", {
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        type_of_secure: typeof SMTP_SECURE,
      });

      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE, // Already boolean from schema
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
        connectionTimeout: 10000, // 10 Sekunden
        greetingTimeout: 10000,
        socketTimeout: 10000,
        dnsTimeout: 5000,
        family: 4,
      });

      // Email content
      const mailOptions = {
        from: `"${name}" <${CONTACT_EMAIL_FROM}>`,
        to: CONTACT_EMAIL_TO,
        replyTo: email, // User kann direkt antworten
        subject: `[p2d2 Kontakt] ${subject}`,
        text: `
Neue Kontaktanfrage über p2d2

Name: ${name}
E-Mail: ${email}
Betreff: ${subject}

Nachricht:
${message}

---
Gesendet: ${new Date().toISOString()}
IP: ${clientIP}
        `.trim(),
        html: `
<h2>Neue Kontaktanfrage über p2d2</h2>

<table style="border-collapse: collapse; width: 100%; max-width: 600px;">
  <tr>
    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">Name</td>
    <td style="padding: 8px; border: 1px solid #ddd;">${name}</td>
  </tr>
  <tr>
    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">E-Mail</td>
    <td style="padding: 8px; border: 1px solid #ddd;"><a href="mailto:${email}">${email}</a></td>
  </tr>
  <tr>
    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background: #f5f5f5;">Betreff</td>
    <td style="padding: 8px; border: 1px solid #ddd;">${subject}</td>
  </tr>
</table>

<h3>Nachricht:</h3>
<div style="padding: 12px; background: #f9f9f9; border-left: 4px solid #0ff078; margin: 16px 0;">
  ${message.replace(/\n/g, "<br>")}
</div>

<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
<p style="font-size: 12px; color: #999;">
  Gesendet: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}<br>
  IP: ${clientIP}
</p>
        `.trim(),
      };

      // Send email
      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent successfully:", info.messageId);

      return new Response(
        JSON.stringify({
          success: true,
          message: "Nachricht erfolgreich gesendet! Wir melden uns zeitnah.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (emailError) {
      console.error("Email sending failed:", emailError);

      // Don't expose SMTP errors to client
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Nachricht konnte nicht gesendet werden. Bitte versuche es später erneut.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error("Error processing contact form:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Interner Serverfehler" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
