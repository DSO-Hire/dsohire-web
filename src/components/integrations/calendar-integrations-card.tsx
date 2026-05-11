"use client";

/**
 * <CalendarIntegrationsCard> — shared client UI for Google + Outlook
 * calendar connections (Phase 5A Day 2).
 *
 * Reused by /employer/settings/integrations and /candidate/settings/
 * integrations. The parent server page loads both connections via
 * `getConnection()` and passes status props down — this component is
 * presentational + handles the disconnect server-action call.
 *
 * Connect button is a plain <a href> to /api/integrations/{provider}/
 * connect — that endpoint sets the state cookie + 302s into Google's
 * (or Microsoft's) consent page. <Link> would intercept with client-
 * side routing, which would break the OAuth handoff.
 *
 * Brand-icon note: lucide-react's Linkedin/Twitter/etc. icons were
 * removed from the package for trademark reasons and we previously
 * caught a deploy break importing them. Inline SVG for any brand
 * marks here (Google "G", Microsoft window).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { disconnectCalendarProvider } from "@/lib/integrations/actions";

interface ConnectionStatus {
  connected: boolean;
  connectedEmail?: string;
  expiresAt?: string;
}

interface Props {
  google: ConnectionStatus;
  microsoft: ConnectionStatus;
  returnTo: string;
  searchParams: {
    integration?: "connected" | "denied" | "error";
    message?: string;
  };
}

export function CalendarIntegrationsCard({
  google,
  microsoft,
  returnTo,
  searchParams,
}: Props) {
  return (
    <div>
      <header className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-[-0.6px] text-ink mb-2">
          Calendar integrations
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Connect your work calendar so interviews scheduled in DSO Hire
          auto-create events with a video link — Google Meet for
          Google, Microsoft Teams for Outlook — and stay in sync with
          your day. Disconnect anytime; existing events stay put.
        </p>
      </header>

      <StatusBanner integration={searchParams.integration} message={searchParams.message} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProviderCard
          provider="google"
          name="Google Calendar"
          valueProp="Auto-create interview events on your Google calendar with a Google Meet link."
          status={google}
          returnTo={returnTo}
        />
        <ProviderCard
          provider="microsoft"
          name="Outlook Calendar (Microsoft 365)"
          valueProp="Auto-create interview events on your Outlook calendar with a Microsoft Teams link."
          status={microsoft}
          returnTo={returnTo}
        />
      </div>
    </div>
  );
}

function StatusBanner({
  integration,
  message,
}: {
  integration?: "connected" | "denied" | "error";
  message?: string;
}) {
  const [visible, setVisible] = useState(Boolean(integration));
  const router = useRouter();

  useEffect(() => {
    if (!integration) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      // Strip the querystring so the banner doesn't re-appear on refresh.
      router.replace(window.location.pathname);
    }, 5000);
    return () => clearTimeout(timer);
  }, [integration, message, router]);

  if (!integration || !visible) return null;

  if (integration === "connected") {
    return (
      <div
        role="status"
        className="mb-5 border-l-4 border-heritage bg-cream text-heritage-deep px-4 py-3 text-[13px] font-semibold"
      >
        Calendar connected successfully.
      </div>
    );
  }

  if (integration === "denied") {
    return (
      <div
        role="status"
        className="mb-5 border-l-4 border-[var(--rule-strong)] bg-cream/60 text-slate-body px-4 py-3 text-[13px]"
      >
        Calendar connection cancelled.
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mb-5 border-l-4 border-red-500 bg-red-50 text-red-800 px-4 py-3 text-[13px]"
    >
      Couldn&apos;t connect calendar{message ? ` — ${message}` : "."}
    </div>
  );
}

function ProviderCard({
  provider,
  name,
  valueProp,
  status,
  returnTo,
}: {
  provider: "google" | "microsoft";
  name: string;
  valueProp: string;
  status: ConnectionStatus;
  returnTo: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDisconnect() {
    const confirmMsg =
      provider === "google"
        ? "Disconnect your Google Calendar from DSO Hire? Future interviews won't be pushed to your calendar until you reconnect."
        : "Disconnect your Outlook Calendar from DSO Hire? Future interviews won't be pushed to your calendar until you reconnect.";
    if (!confirm(confirmMsg)) return;

    setError(null);
    startTransition(async () => {
      const res = await disconnectCalendarProvider(provider);
      if (!res.ok) {
        setError(res.error ?? "Couldn't disconnect.");
        return;
      }
      router.refresh();
    });
  }

  const connectHref = `/api/integrations/${provider}/connect?next=${encodeURIComponent(
    returnTo
  )}`;

  return (
    <div className="border border-[var(--rule)] rounded-lg p-6 bg-white flex flex-col">
      <div className="flex items-start gap-3 mb-3">
        <ProviderLogo provider={provider} />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-ink leading-snug">
            {name}
          </h3>
        </div>
        <StatusTag connected={status.connected} />
      </div>

      <p className="text-[13px] text-slate-body leading-relaxed mb-4">
        {valueProp}
      </p>

      <div className="mt-auto pt-3 border-t border-[var(--rule)]">
        <div className="flex items-center gap-2 mb-3 text-[12px]">
          <span
            aria-hidden
            className={
              "inline-block h-2 w-2 rounded-full " +
              (status.connected ? "bg-heritage-deep" : "bg-slate-300")
            }
          />
          {status.connected ? (
            <span className="text-slate-body">
              Connected as{" "}
              <span className="font-semibold text-ink">
                {status.connectedEmail ?? "—"}
              </span>
              {status.expiresAt && (
                <span className="text-slate-meta">
                  {" · token refreshes "}
                  {formatRelative(status.expiresAt)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-meta">Not connected</span>
          )}
        </div>

        {status.connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={pending}
            className="inline-flex items-center gap-2 border border-rule text-slate-body hover:bg-cream px-4 py-2 rounded text-[13px] font-semibold disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Disconnect
          </button>
        ) : (
          <a
            href={connectHref}
            className="inline-flex items-center gap-2 bg-heritage text-white hover:bg-heritage-deep px-4 py-2 rounded text-[13px] font-semibold"
          >
            {provider === "google"
              ? "Connect Google Calendar"
              : "Connect Outlook"}
          </a>
        )}

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusTag({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep bg-cream px-2 py-1 rounded">
        Connected
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta bg-cream/60 px-2 py-1 rounded">
      Off
    </span>
  );
}

function ProviderLogo({ provider }: { provider: "google" | "microsoft" }) {
  if (provider === "google") {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="flex-shrink-0"
      >
        <circle cx="14" cy="14" r="14" fill="#FFFFFF" stroke="#E5E7EB" />
        <path
          d="M21.6 14.2c0-.53-.05-1.04-.14-1.53H14v2.9h4.27c-.18.97-.74 1.79-1.58 2.34v1.94h2.56c1.5-1.38 2.35-3.42 2.35-5.65z"
          fill="#4285F4"
        />
        <path
          d="M14 22c2.13 0 3.92-.71 5.23-1.92l-2.56-1.99c-.71.48-1.62.76-2.67.76-2.05 0-3.79-1.38-4.41-3.24H6.94v2.04A8 8 0 0014 22z"
          fill="#34A853"
        />
        <path
          d="M9.59 15.61a4.8 4.8 0 010-3.04V10.53H6.94a8 8 0 000 6.94l2.65-2.04z"
          fill="#FBBC04"
        />
        <path
          d="M14 8.94c1.16 0 2.2.4 3.02 1.18l2.27-2.27A8 8 0 006.94 10.05l2.65 2.04C10.21 10.32 11.95 8.94 14 8.94z"
          fill="#EA4335"
        />
      </svg>
    );
  }

  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="flex-shrink-0"
    >
      <rect width="28" height="28" rx="2" fill="#FFFFFF" stroke="#E5E7EB" />
      <rect x="5" y="5" width="8.5" height="8.5" fill="#F25022" />
      <rect x="14.5" y="5" width="8.5" height="8.5" fill="#7FBA00" />
      <rect x="5" y="14.5" width="8.5" height="8.5" fill="#00A4EF" />
      <rect x="14.5" y="14.5" width="8.5" height="8.5" fill="#FFB900" />
    </svg>
  );
}

function formatRelative(iso: string): string {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "soon";
  const diffMs = target - Date.now();
  const past = diffMs < 0;
  const absMin = Math.round(Math.abs(diffMs) / 60_000);
  if (absMin < 60) return past ? `${absMin}m ago` : `in ${absMin}m`;
  const absHr = Math.round(absMin / 60);
  if (absHr < 24) return past ? `${absHr}h ago` : `in ${absHr}h`;
  const absDay = Math.round(absHr / 24);
  return past ? `${absDay}d ago` : `in ${absDay}d`;
}
