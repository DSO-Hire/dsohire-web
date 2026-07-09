"use client";

/**
 * Employer app-shell error boundary — the rail/top bar survive; the
 * content area shows the shared branded panel instead of Next's stock
 * error screen. See components/app/route-error-panel.tsx.
 */

import { RouteErrorPanel } from "@/components/app/route-error-panel";

export default function EmployerAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorPanel
      error={error}
      reset={reset}
      dashboardHref="/employer/dashboard"
    />
  );
}
