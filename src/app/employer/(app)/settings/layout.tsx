/**
 * /employer/settings/* layout (Phase 4.5.a).
 *
 * Adds the settings 2-column body (left-rail nav + main content) on top of
 * the persistent employer shell. Auth + DSO check happen ONE level up in the
 * (app) route-group layout, so this nested layout is presentational — it no
 * longer wraps EmployerShell itself (that moved up when the shell became a
 * persistent layout).
 *
 * Sub-routes consume the layout simply by living under
 * `/employer/settings/<category>/page.tsx` — no extra wrapper needed.
 *
 * The settings nav is a client component (needs `usePathname` for the
 * active-row highlight). Everything else here stays server-side so each
 * sub-page's data fetches happen on the same server render.
 */

import { SettingsNav } from "./_components/settings-nav";

interface LayoutProps {
  children: React.ReactNode;
}

export default function EmployerSettingsLayout({ children }: LayoutProps) {
  return (
    <>
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
    </>
  );
}
