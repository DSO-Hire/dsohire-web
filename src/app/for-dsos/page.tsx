import { permanentRedirect } from "next/navigation";

/**
 * Old employer-lens URL. The page moved to /for-dental-groups when the lens
 * was renamed "For DSOs" → "Dental Groups" (2026-05-22).
 *
 * This is a PAGE-LEVEL redirect on purpose. A config-level redirects() entry
 * in next.config crashed Vercel's build at the "Applying modifyConfig" step
 * (TypeError: path argument must be of type string — a Vercel build-side
 * regression that day). A page redirect achieves the same thing without going
 * through that config-injection path, so the old URL stays alive and the
 * build stays green.
 */
export default function ForDsosRedirect() {
  permanentRedirect("/for-dental-groups");
}
