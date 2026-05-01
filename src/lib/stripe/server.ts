/**
 * Stripe server SDK — singleton client.
 *
 * Use only in server-side code (server components, server actions, route
 * handlers). Reads STRIPE_SECRET_KEY from env. Never import this from a
 * client component — it would expose the secret to the browser bundle.
 *
 * `apiVersion` is pinned so Stripe upgrades don't silently change behavior.
 * Bump it deliberately when you've reviewed the Stripe changelog.
 */

import Stripe from "stripe";

let cachedClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (cachedClient) return cachedClient;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to Vercel + .env.local before using the Stripe SDK."
    );
  }

  cachedClient = new Stripe(secret, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
    appInfo: {
      name: "DSO Hire",
      url: "https://dsohire.com",
    },
  });

  return cachedClient;
}
