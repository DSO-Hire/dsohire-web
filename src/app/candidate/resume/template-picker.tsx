"use client";

/**
 * #87c — template picker for the résumé view. Selecting a template persists it
 * (setResumeTemplate) and refreshes so the server-rendered preview + the PDF
 * pick it up. Pure presentation swap — never touches résumé content.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  RESUME_TEMPLATE_LIST,
  type ResumeTemplateId,
} from "@/lib/resume/resume-templates";
import { setResumeTemplate } from "./actions";

export function TemplatePicker({ current }: { current: ResumeTemplateId }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ResumeTemplateId>(current);
  const [pending, startTransition] = useTransition();

  function pick(id: ResumeTemplateId) {
    if (id === selected || pending) return;
    const prev = selected;
    setSelected(id);
    startTransition(async () => {
      const res = await setResumeTemplate(id);
      if (res.ok) router.refresh();
      else setSelected(prev);
    });
  }

  return (
    <div className="no-print mx-auto mb-4 max-w-[760px] px-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[2.5px] text-slate-meta">
        Template
      </div>
      <div className="flex flex-wrap gap-2">
        {RESUME_TEMPLATE_LIST.map((tpl) => {
          const active = tpl.id === selected;
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => pick(tpl.id)}
              disabled={pending}
              title={tpl.blurb}
              className={
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 " +
                (active
                  ? "border-heritage-deep bg-heritage-deep text-ivory"
                  : "border-[var(--rule)] bg-white text-slate-body hover:border-heritage-deep")
              }
            >
              {active && <Check className="h-3 w-3" />}
              {tpl.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
