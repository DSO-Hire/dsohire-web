"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

/*
 * Error boundary inside the CRM shell. Never renders error.message: in
 * production it is generic anyway, and in development it can carry
 * Postgres detail. The digest matches the server log line.
 */
export default function CrmError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  function again() {
    startTransition(() => {
      if (retry) {
        retry();
        return;
      }
      router.refresh();
      reset?.();
    });
  }

  return (
    <div className="dcardx ws-oops" role="alert">
      <h1>This page did not load</h1>
      <p>The data is safe. Try again, or head back to Today.</p>
      {error.digest ? (
        <p>
          <code>REF {error.digest}</code>
        </p>
      ) : null}
      <div className="row">
        <button type="button" className="dbtn dbtn-green" onClick={again}>
          Try again
        </button>
        <Link className="dbtn dbtn-line" href="/crm">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
