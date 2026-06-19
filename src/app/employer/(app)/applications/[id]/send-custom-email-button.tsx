"use client";

/**
 * SendCustomEmailButton — opens a dialog with a custom-template picker,
 * live preview, and a send button. Renders on the application detail
 * page next to the existing notification surfaces.
 *
 * Available list is loaded server-side by the parent page (custom +
 * non-archived templates for the DSO). When the list is empty we still
 * render the button but disable it with a tooltip pointing at the
 * settings page.
 *
 * Visible only when the parent has determined the DSO is on Growth+
 * (tier gate enforced by the server action regardless).
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sendCustomTemplateEmail } from "./send-custom-email-action";
import { sanitizeTiptapHtml } from "@/lib/html/sanitize-tiptap";
import {
  buildSampleContext,
  renderTemplate,
} from "@/lib/email/templates/renderer";

export interface CustomTemplateOption {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  subject: string;
  body_html: string;
}

interface Props {
  applicationId: string;
  candidateDisplayName: string;
  templates: CustomTemplateOption[];
}

export function SendCustomEmailButton({
  applicationId,
  candidateDisplayName,
  templates,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(
    templates[0]?.id ?? ""
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const noTemplates = templates.length === 0;

  function openDialog() {
    setError(null);
    setSent(false);
    if (templates[0]) setSelectedId(templates[0].id);
    setOpen(true);
  }

  function onSend() {
    setError(null);
    setSent(false);
    if (!selectedId) {
      setError("Pick a template first.");
      return;
    }
    startTransition(async () => {
      const result = await sendCustomTemplateEmail({
        applicationId,
        templateId: selectedId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
      // Auto-close after a short delay so the user can see the confirmation.
      setTimeout(() => setOpen(false), 1400);
    });
  }

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  );

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--rule-strong)] bg-card px-3 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-ink hover:bg-cream/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
      >
        <Mail className="size-3.5" />
        Send email
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Sparkles className="size-4 text-heritage-deep" />
              Send a template to {candidateDisplayName}
            </DialogTitle>
            <DialogDescription>
              Pick one of your custom email templates. Mergefields are filled
              in from this candidate&apos;s profile before sending.
            </DialogDescription>
          </DialogHeader>

          {noTemplates ? (
            <div className="border border-warning bg-warning-bg p-4 text-sm text-warning">
              <p className="font-semibold mb-1">No custom templates yet.</p>
              <p className="leading-relaxed">
                Build your first one — interview prep, offer follow-ups, no-show
                outreach — at{" "}
                <Link
                  href="/employer/settings/templates"
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  Settings → Email templates
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Template picker */}
              <div>
                <label
                  htmlFor="custom-template-select"
                  className="mb-1.5 block text-[12px] font-semibold text-ink"
                >
                  Template
                </label>
                <select
                  id="custom-template-select"
                  value={selectedId}
                  onChange={(e) => {
                    setError(null);
                    setSent(false);
                    setSelectedId(e.target.value);
                  }}
                  className="w-full rounded border border-[var(--rule-strong)] bg-card px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selected?.description && (
                  <p className="mt-1.5 text-[12px] text-slate-meta">
                    {selected.description}
                  </p>
                )}
              </div>

              {/* Preview */}
              {selected && (
                <PreviewPane
                  kind={selected.kind}
                  subject={selected.subject}
                  bodyHtml={selected.body_html}
                />
              )}
            </div>
          )}

          {error && (
            <div className="border border-danger bg-danger-bg px-3 py-2 text-[13px] text-danger inline-flex items-start gap-2">
              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {sent && !error && (
            <div className="border border-heritage/40 bg-heritage/[0.08] px-3 py-2 text-[13px] text-heritage-deep inline-flex items-center gap-2">
              <CheckCircle2 className="size-3.5" />
              <span className="font-semibold">Sent.</span>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex items-center justify-center px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-card text-slate-body hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
            >
              {sent ? "Close" : "Cancel"}
            </button>
            {!noTemplates && (
              <button
                type="button"
                onClick={onSend}
                disabled={pending || sent}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send email"
                )}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Mini preview pane ─── */

function PreviewPane({
  kind,
  subject,
  bodyHtml,
}: {
  kind: string;
  subject: string;
  bodyHtml: string;
}) {
  const sample = useMemo(() => buildSampleContext(kind), [kind]);

  const subjectResult = useMemo(
    () =>
      renderTemplate({
        kind,
        template: subject,
        context: sample,
        mode: "subject",
      }),
    [kind, subject, sample]
  );
  const bodyResult = useMemo(
    () =>
      renderTemplate({
        kind,
        template: bodyHtml,
        context: sample,
        mode: "preview",
      }),
    [kind, bodyHtml, sample]
  );
  const cleanBody = useMemo(
    () => sanitizeTiptapHtml(bodyResult.output),
    [bodyResult.output]
  );

  return (
    <div className="border border-[var(--rule)] bg-cream/30 overflow-hidden max-h-[320px] flex flex-col">
      <div className="border-b border-[var(--rule)] bg-card px-4 py-2">
        <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-0.5">
          Preview · sample data
        </div>
        <div className="text-[13px] font-semibold text-ink truncate">
          {subjectResult.output || (
            <span className="text-slate-meta italic">(subject missing)</span>
          )}
        </div>
      </div>
      <div className="bg-card px-4 py-3 overflow-y-auto flex-1">
        {cleanBody ? (
          <div
            className="dso-prose text-[13px] text-ink"
            dangerouslySetInnerHTML={{ __html: cleanBody }}
          />
        ) : (
          <p className="text-[12px] text-slate-meta italic">(body empty)</p>
        )}
      </div>
    </div>
  );
}
