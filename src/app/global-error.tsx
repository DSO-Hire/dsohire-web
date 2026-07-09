"use client";

/**
 * global-error.tsx — last-resort boundary (root layout itself threw).
 *
 * Renders its own <html>/<body>, so nothing from globals.css or the layout
 * is guaranteed to exist — every style here is inline and self-contained.
 * Brand constants are hardcoded ON PURPOSE (ivory paper, ink text, heritage
 * accent, square corners); this is the one file where hex-over-token is
 * correct, because the token layer may be exactly what failed.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F7F4ED",
          color: "#14233F",
          fontFamily:
            "Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif",
          WebkitFontSmoothing: "antialiased",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 560, textAlign: "center" }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "3.5px",
              textTransform: "uppercase",
              color: "#2F5D4F",
              marginBottom: 16,
            }}
          >
            Something broke
          </div>
          <h1
            style={{
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: "-1px",
              lineHeight: 1.1,
              margin: "0 0 14px",
            }}
          >
            That wasn&apos;t supposed to happen.
          </h1>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: "#4A6278",
              margin: "0 0 28px",
            }}
          >
            Something went wrong on our side — your data is safe. Try again,
            and if it keeps happening, email{" "}
            <a
              href="mailto:info@dsohire.com"
              style={{ color: "#2F5D4F", fontWeight: 700 }}
            >
              info@dsohire.com
            </a>
            {error.digest ? ` and mention error ${error.digest}` : ""}.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#14233F",
              color: "#F7F4ED",
              border: "none",
              borderRadius: 0,
              padding: "12px 28px",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
