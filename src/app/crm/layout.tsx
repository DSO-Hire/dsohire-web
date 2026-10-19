import type { Metadata } from "next";
import "./crm.css";

/* DSO Hire CRM (2026-10-19), a port of the EDC CRM. Manrope is the DSO Hire
   typeface and comes from the app root (--font-manrope); the CRM's caps
   labels and figures use it too (tabular numerals in crm.css) instead of
   EDC's IBM Plex Mono. */
export const metadata: Metadata = {
  title: { default: "DSO Hire CRM", template: "%s · DSO Hire CRM" },
  robots: { index: false, follow: false },
};

export default function CrmRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-root">{children}</div>
  );
}
