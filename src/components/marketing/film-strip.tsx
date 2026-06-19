"use client";

/**
 * #115 FOH-3 (Day 32 port, from FOH 100x Model 01) — the homepage film strip.
 *
 * "Walk the back office": five DRAWN product frames inside browser chrome —
 * pipeline, automations, offer approvals, permissions, analytics. Drawn (not
 * screenshots) by design: pixel-true to the app's design system with zero
 * dependency on seed-data cleanliness (#112) or screenshot staging. Every
 * captioned capability is shipped and real; the data inside the frames is
 * illustrative (and says so under the strip).
 *
 * Client component for the arrow buttons + scroll-snap; static content, so
 * SSR output is complete for SEO/no-JS. No site-shell imports (build rule).
 * Reduced-motion: entrances are handled by the [data-reveal] layer (inert
 * under prefers-reduced-motion); scrolling falls back to native swipe.
 */

import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/* ── shared drawn-UI atoms ───────────────────────────── */

function FrameChrome({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-ink-1000 border border-hero-foreground/15 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hero-foreground/10">
        <span className="w-2 h-2 rounded-full bg-ivory/20" aria-hidden />
        <span className="w-2 h-2 rounded-full bg-ivory/20" aria-hidden />
        <span className="w-2 h-2 rounded-full bg-ivory/20" aria-hidden />
        <span className="ml-2 text-[9px] tracking-[0.6px] text-hero-foreground/45 bg-hero-foreground/5 px-2.5 py-0.5">
          {url}
        </span>
      </div>
      <div className="bg-ivory text-ink min-h-[300px] p-4">{children}</div>
    </div>
  );
}

function UiHead({ title, chip }: { title: string; chip: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-[12px] font-extrabold tracking-[-0.2px]">{title}</span>
      <span
        className="text-[8px] font-bold tracking-[1px] uppercase px-2 py-0.5 text-heritage-deep"
        style={{ background: "var(--heritage-tint)" }}
      >
        {chip}
      </span>
    </div>
  );
}

function KbCard({
  name,
  role,
  fit,
  masked,
  active,
}: {
  name: string;
  role: string;
  fit: number;
  masked?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`bg-card border border-[var(--rule-strong)] p-2 mb-2 ${
        active ? "shadow-[0_0_0_2px_rgba(77,122,96,0.5)]" : ""
      }`}
    >
      <div
        className={`text-[9px] font-extrabold ${
          masked ? "italic text-slate-meta" : ""
        }`}
      >
        {name}
      </div>
      <div className="text-[8px] text-slate-meta mt-0.5 mb-1">{role}</div>
      <span
        className="inline-block text-[8px] font-extrabold px-1.5 py-0.5 text-heritage-deep"
        style={{ background: "var(--heritage-tint)" }}
      >
        Fit {fit}
      </span>
    </div>
  );
}

function RuleCard({ when, what }: { when: string; what: string }) {
  return (
    <div className="bg-card border border-[var(--rule-strong)] border-l-[3px] border-l-heritage px-3.5 py-3 mb-2.5 flex items-center justify-between gap-3">
      <div>
        <div className="text-[8px] font-extrabold tracking-[1.2px] uppercase text-slate-meta">
          {when}
        </div>
        <div className="text-[10px] font-bold mt-0.5">{what}</div>
      </div>
      <span className="relative inline-block w-[26px] h-[14px] shrink-0 bg-heritage" aria-hidden>
        <span className="absolute top-[2px] right-[2px] w-[10px] h-[10px] bg-card" />
      </span>
    </div>
  );
}

function ChainStep({
  n,
  done,
  who,
  sub,
}: {
  n: string;
  done?: boolean;
  who: string;
  sub: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-dashed border-[var(--rule-strong)] last:border-b-0">
      <span
        className={`flex items-center justify-center w-[22px] h-[22px] shrink-0 text-[10px] font-extrabold ${
          done ? "bg-heritage text-primary-foreground" : "bg-ivory-deep text-slate-meta"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div>
        <div className="text-[10px] font-extrabold">{who}</div>
        <div className="text-[8.5px] text-slate-meta mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function Bar({ h, pct, label, hg }: { h: string; pct: string; label: string; hg?: boolean }) {
  return (
    <div className={`relative flex-1 ${hg ? "bg-heritage" : "bg-ink"}`} style={{ height: h }}>
      <span className="absolute -top-4 inset-x-0 text-center text-[8px] font-extrabold">{pct}</span>
      <span className="absolute -bottom-4 inset-x-0 text-center text-[7px] uppercase tracking-[0.5px] text-slate-meta">
        {label}
      </span>
    </div>
  );
}

/* ── the five frames ─────────────────────────────────── */

function PipelineFrame() {
  return (
    <FrameChrome url="app.dsohire.com/employer/pipeline">
      <UiHead title="Pipeline — every practice, every role" chip="Realtime" />
      <div className="grid grid-cols-4 gap-2.5">
        <div>
          <div className="flex justify-between text-[8px] font-extrabold tracking-[1px] uppercase text-slate-meta mb-2">
            <span>Applied</span>
            <span>14</span>
          </div>
          <KbCard name="Maria G." role="RDA · Chandler" fit={88} />
          <KbCard name="Candidate RDH-4821" role="Hygienist · Mesa" fit={91} masked />
        </div>
        <div>
          <div className="flex justify-between text-[8px] font-extrabold tracking-[1px] uppercase text-slate-meta mb-2">
            <span>Screening</span>
            <span>6</span>
          </div>
          <KbCard name="Devon P." role="Front Office · Tempe" fit={79} />
        </div>
        <div>
          <div className="flex justify-between text-[8px] font-extrabold tracking-[1px] uppercase text-slate-meta mb-2">
            <span>Interview</span>
            <span>3</span>
          </div>
          <KbCard name="Dr. Sarah Chen" role="Associate · Boise" fit={94} active />
        </div>
        <div>
          <div className="flex justify-between text-[8px] font-extrabold tracking-[1px] uppercase text-slate-meta mb-2">
            <span>Offer</span>
            <span>1</span>
          </div>
          <KbCard name="James R." role="Ops Manager · Corp" fit={86} />
        </div>
      </div>
    </FrameChrome>
  );
}

function AutomationsFrame() {
  return (
    <FrameChrome url="app.dsohire.com/employer/automations">
      <UiHead title="Automation rules" chip="18 active" />
      <RuleCard when="When · stage becomes Interview" what="Send interview-prep sequence + calendar link" />
      <RuleCard when="When · application received" what="Branded confirmation, practice-masked sender" />
      <RuleCard when="When · 7 days stale in Screening" what="Nudge the hiring manager, flag on dashboard" />
      <RuleCard when="When · offer accepted" what="Close role, notify team, archive pipeline" />
    </FrameChrome>
  );
}

function OffersFrame() {
  return (
    <FrameChrome url="app.dsohire.com/employer/offer-approvals">
      <UiHead title="Offer · Associate Dentist, Boise" chip="Pending" />
      <ChainStep n="1" done who="Drafted by Recruiter — Alyssa M." sub="Base $175K · Daily rate guarantee · Sign-on $10K" />
      <ChainStep n="2" done who="Comp guardrail check" sub="Within approved band for Associate · Mountain West" />
      <ChainStep n="3" who="Awaiting owner approval" sub="Letter held until approved. Nothing sends early." />
    </FrameChrome>
  );
}

function PermissionsFrame() {
  const rows: Array<[string, string, string, string]> = [
    ["Move pipeline stages", "✓", "✓", "✓"],
    ["Send offers directly", "✓", "✗", "✗"],
    ["Edit job postings", "✓", "✓", "✗"],
    ["See confidential searches", "✓", "By grant", "✗"],
    ["Billing & plan", "✓", "✗", "✗"],
  ];
  return (
    <FrameChrome url="app.dsohire.com/employer/team">
      <UiHead title="Team permissions" chip="Per-teammate" />
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr>
            {["Capability", "Owner", "Recruiter", "Hiring Mgr"].map((h) => (
              <th
                key={h}
                className="text-left text-[7.5px] font-extrabold tracking-[0.8px] uppercase text-slate-meta px-1.5 py-1 border-b border-[var(--rule-strong)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              <td className="px-1.5 py-1.5 border-b border-[var(--rule)] font-semibold">{r[0]}</td>
              {r.slice(1).map((c, i) => (
                <td
                  key={i}
                  className={`px-1.5 py-1.5 border-b border-[var(--rule)] font-extrabold ${
                    c === "✗" ? "text-danger" : "text-heritage-deep"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2.5 text-[8.5px] text-slate-meta">
        🔒 Confidential search: visible to 2 of 9 teammates
      </div>
    </FrameChrome>
  );
}

function AnalyticsFrame() {
  return (
    <FrameChrome url="app.dsohire.com/employer/analytics">
      <UiHead title="Advance rate by fit band" chip="Outcome proof" />
      <div className="flex items-end gap-2.5 h-[130px] mx-1.5 mt-6 mb-7">
        <Bar h="22%" pct="11%" label="Fit <50" />
        <Bar h="38%" pct="19%" label="50–69" />
        <Bar h="64%" pct="32%" label="70–84" hg />
        <Bar h="92%" pct="46%" label="85+" hg />
      </div>
      <div className="text-[8.5px] text-slate-meta">
        Advance-to-interview rate by PracticeFit band. Shown once a group has ≥10 scored applications.
      </div>
    </FrameChrome>
  );
}

/* ── the strip ───────────────────────────────────────── */

const FRAMES: Array<{
  body: React.ReactNode;
  title: string;
  caption: string;
}> = [
  {
    body: <PipelineFrame />,
    title: "One pipeline across every practice",
    caption:
      "Drag-and-drop stages, realtime updates, anonymity masking enforced everywhere a candidate appears. Stage moves trigger your automations.",
  },
  {
    body: <AutomationsFrame />,
    title: "Automations that run your follow-up",
    caption:
      "Stage-triggered rules, candidate sequences, stale-pipeline alerts — the busywork happens while you run your practices.",
  },
  {
    body: <OffersFrame />,
    title: "Offers with guardrails",
    caption:
      "Approval chains and comp bands mean a $200K mistake can't leave the building. Held letters dispatch only on approval.",
  },
  {
    body: <PermissionsFrame />,
    title: "Permissions that match your org",
    caption:
      "30+ actions individually gated. Run a confidential replacement search the rest of the team can't see — enforced at the database, not the UI.",
  },
  {
    body: <AnalyticsFrame />,
    title: "Proof, not promises",
    caption:
      "Time-to-fill, source quality, and PracticeFit outcome curves — your hiring data working like a PE-grade ops report.",
  },
];

export function FilmStrip() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    const frame = el.querySelector<HTMLElement>("[data-frame]");
    el.scrollBy({
      left: dir * ((frame?.offsetWidth ?? 520) + 26),
      behavior: "smooth",
    });
  };

  return (
    <section className="relative bg-hero text-hero-foreground py-24 overflow-hidden">
      {/* brand grid wash */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(247,244,237,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(247,244,237,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      <div className="relative max-w-[1240px] mx-auto px-6 sm:px-14">
        <div
          data-reveal
          className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-light"
        >
          Walk the back office
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] mt-2.5 mb-3"
        >
          The job board is the lobby.
          <br />
          This is the building.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-[15px] text-hero-foreground/60 leading-[1.7] max-w-[620px]"
        >
          Behind every posting is a full hiring operating system — the same
          machinery enterprise recruiting teams pay five figures for, built
          dental-only.
        </p>
      </div>

      <div className="relative max-w-[1240px] mx-auto px-6 sm:px-14">
        <div
          ref={ref}
          className="film-scroll flex gap-[26px] overflow-x-auto snap-x snap-mandatory pt-11 pb-4 px-1"
        >
          {FRAMES.map((f, i) => (
            <div
              key={f.title}
              data-frame
              data-reveal
              style={{ "--mk-delay": `${i * 80}ms` } as React.CSSProperties}
              className="shrink-0 w-[min(560px,86vw)] snap-center"
            >
              {f.body}
              <div className="mt-3.5">
                <div className="text-[15px] font-extrabold tracking-[-0.2px] text-hero-foreground">
                  {f.title}
                </div>
                <div className="text-[12.5px] text-hero-foreground/55 leading-[1.6] mt-1">
                  {f.caption}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3" data-reveal>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => scroll(-1)}
              aria-label="Previous frame"
              className="w-[42px] h-[42px] inline-flex items-center justify-center border border-hero-foreground/30 text-hero-foreground hover:bg-heritage hover:border-heritage transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scroll(1)}
              aria-label="Next frame"
              className="w-[42px] h-[42px] inline-flex items-center justify-center border border-hero-foreground/30 text-hero-foreground hover:bg-heritage hover:border-heritage transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-[9px] tracking-[1.2px] uppercase text-hero-foreground/35">
            Illustrations of the live product · sample data
          </span>
        </div>
      </div>
    </section>
  );
}
