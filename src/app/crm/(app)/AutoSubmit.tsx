"use client";

/*
 * Submits a GET filter form as soon as one of its dropdowns changes, so a
 * sort or filter applies without pressing Apply. Typed search still waits
 * for Enter or Apply.
 */
import { useEffect } from "react";

export default function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const onChange = (e: Event) => {
      if (e.target instanceof HTMLSelectElement) form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [formId]);
  return null;
}
