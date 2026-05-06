/**
 * /employer/settings/* layout (Phase 4.5.a).
 *
 * Wraps all settings sub-routes with EmployerShell + a 2-column body
 * (left-rail nav + main content). Auth + DSO check happens inside
 * EmployerShell, so child pages don't have to repeat it.
 *
 * Sub-routes consume the layout simply by living under
 * `/employer/settings/<category>/page.tsx` — no extra wrapper needed.
 *
 * The settings nav is a client component (needs `usePathname` for the
 * active-row highlight). Everything else here stays server-side so each
 * sub-page's data fetches happen on the same server render.
 */

import { EmployerShell } from "@/components/employer/employer-shell";
import { SettingsNav } from "./_components/settings-nav";

interface LayoutProps {
  children: React.ReactNode;
}

export default function EmployerSettingsLayout({ children }: LayoutProps) {
  return (
    <EmployerShell active="settings">
      <header className="mb-8 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Settings
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.05] text-ink">
          Configure DSO Hire for your team
        </h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
        <aside className="min-w-0">
          <div className="lg:sticky lg:top-6">
            <SettingsNav />
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </EmployerShell>
  );
}
