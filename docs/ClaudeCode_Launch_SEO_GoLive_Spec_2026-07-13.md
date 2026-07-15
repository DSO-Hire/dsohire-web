# Claude Code Handoff — Launch SEO Go-Live (2026-07-13)

**Goal:** flip dsohire.com from deliberately-invisible (pre-launch lockdown) to
aggressively discoverable, and stand up the surfaces that earn AI-engine
citations. Companion to `docs/job-distribution-go-live.md` (the distribution
runbook) — this spec covers the SEO/AI-visibility layer only. Do NOT duplicate
or modify the distribution gating; it has its own runbook and guardrails.

**Context:** 6 weeks of AI-visibility tracking (see
`DSO Hire/Marketing & Outreach/DSO_Hire_AI_Visibility_Tracker.xlsx`) shows 0%
citation rate across 8 buyer questions — expected, because the site is
site-wide `noindex` + robots `Disallow: /`. Competitors owning the answers:
DentalPost + ADA CareerCenter (job-board queries), Cloud Dentistry
(multi-location DSO query), Wizehire/AvaHR/VIVAHR (ATS query). Unowned lanes:
time-to-hire, culture-fit screening, DSO multi-location *permanent* hiring.

---

## Sequencing constraint (read first)

The indexing flip (Phase 1) must NOT deploy until the demo/seed data scrub is
done (steps 1–3 of `docs/job-distribution-go-live.md`). Indexing fake
JobPosting data risks a Google for Jobs structured-data policy strike on the
domain. Phases 2–4 of this spec are safe to build and merge at any time — they
are inert while the noindex block is in place. So: **build everything now,
deploy freely; the layout.tsx/robots.ts change is the one commit that waits
for Cam's explicit go.**

---

## Phase 1 — The indexing flip (1 commit, deploy on Cam's go)

1. `src/app/layout.tsx` — remove the `robots` block (lines ~26–41, the
   PRE-LAUNCH INDEXING LOCKDOWN comment + `robots: { index: false, ... }`).
2. `src/app/robots.ts` — replace blanket disallow with the real policy already
   written in its own comment:
   ```ts
   return {
     rules: [{ userAgent: "*", allow: "/", disallow: ["/employer/", "/candidate/", "/admin/", "/api/", "/o/", "/r/", "/auth/", "/embed/"] }],
     sitemap: "https://dsohire.com/sitemap.xml",
   };
   ```
   - Keep `/embed/` disallowed (iframe content, already noindexed inline).
   - Do NOT disallow `/feeds/` — Indeed's crawler needs it.
   - Explicitly allow AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-
     Extended) — i.e., don't add rules blocking them. Being readable by AI
     crawlers is the point of this whole effort.
3. Verify `coming-soon` proxy gate interaction: `PREVIEW_GATE_DISABLED=true`
   must be set in Vercel env before/with this deploy, otherwise crawlers hit
   the coming-soon page and index that.

**Acceptance:** `curl -s https://dsohire.com/robots.txt` shows allow policy +
sitemap; `curl -s https://dsohire.com | grep -i robots` shows no noindex meta;
`/sitemap.xml` returns 200 with the full route set.

## Phase 2 — Structured data gaps (safe to ship immediately)

1. **Organization + WebSite JSON-LD on the homepage** (`src/app/page.tsx` or a
   small shared component in `src/components/seo/`). Organization: name
   "DSO Hire", url, logo (use the canonical PNG export per logo-canon rules —
   `public/` brand SVG/PNG, never re-typeset), sameAs → LinkedIn company page
   (get URL from Cam; leave TODO if unknown). WebSite: name + url. No
   SearchAction (our search is authed).
2. **JobPosting audit** — `buildJobPostingJsonLd` in
   `src/lib/distribution/public-jobs.ts` already exists and is gated. Audit
   only: validate output against Google Rich Results requirements
   (datePosted, validThrough, hiringOrganization, jobLocation,
   baseSalary when `compensation_visible`). Fix gaps; do not weaken masking
   or the `internal_only` exclusion in `/jobs/[id]/page.tsx` (~line 1000).
3. **FAQPage JSON-LD** on `/pricing` and `/practicefit` if those pages have
   (or gain) FAQ sections — only mark up FAQ content that is actually
   rendered on-page (Google policy).
4. **BreadcrumbList** on the salary programmatic pages
   (`/salary/[role]/[state]/[metro]`) — cheap win for a large page set.

## Phase 3 — /guides section + 3 pillar pages (safe to ship immediately)

New static marketing route group `src/app/guides/`:

- `/guides` — lightweight index page listing the guides.
- `/guides/dso-multi-location-hiring`
- `/guides/reduce-time-to-hire-dental-practice`
- `/guides/dental-culture-fit-screening`

Content: Cam has final drafts in
`DSO Hire/Marketing & Outreach/Pillar_Pages_2026-07-13/` (three .md files).
Render them with the site's marketing typography (same patterns as
`/dental-hiring-report` or legal pages — prose-heavy, SiteShell wrapper).
Requirements:

- Each page: proper `metadata` export (title/description from the draft
  front-matter), Article JSON-LD (headline, datePublished, author =
  Organization "DSO Hire"), FAQPage JSON-LD from the draft's FAQ section.
- Internal links per the draft's "Internal links" note (jobs, /practicefit,
  /vs/staffing-agencies, /salary, relevant /for-* pages).
- Add all four routes to `ROUTES` in `src/app/sitemap.ts` (priority 0.7,
  changeFrequency monthly; index page 0.6).
- Marketing CTAs must be auth-aware (`lib/marketing/candidate-cta.ts` pattern
  / employer equivalent) — standing rule, no signed-in user should ever land
  on a sign-up page.
- House rules: no fabricated numbers, no unverifiable claims ("largest",
  "fastest"), product claims must be code-true. The drafts respect this —
  don't "punch up" copy with invented stats.

## Phase 4 — AI-crawler affordances (small, safe to ship immediately)

1. **`/llms.txt`** — static route (`src/app/llms.txt/route.ts`) returning a
   plain-text map: one-paragraph description of DSO Hire (dental/DSO-native
   hiring platform + two-sided fit matching), then key URLs with one-line
   descriptions (/, /for-dental-groups, /for-candidates, /practicefit,
   /pricing, /jobs, /salary, the 3 guides, /vs/* pages). Keep it under ~60
   lines.
2. Confirm nothing in Vercel/WAF config blocks GPTBot/ClaudeBot/PerplexityBot
   (check any middleware user-agent handling in `src/proxy.ts`).

## Not in scope for Code (Cam ops checklist, post-flip, same day)

- Google Search Console: verify domain property, submit sitemap, request
  indexing for /, /jobs, /pricing, /practicefit, 3 guides.
- Bing Webmaster Tools: verify + submit sitemap (feeds ChatGPT browsing).
- Create/complete: LinkedIn company page, Crunchbase, G2 + Capterra listings
  (ATS / dental software categories).
- Listicle outreach: Denota "best dental job boards", Princess Dental
  Staffing blog, Betterteam, TEC/FitGap — request inclusion.
- Indeed/LinkedIn feed submission per `docs/job-distribution-go-live.md` §6.

## Tests

- Extend the existing harness: robots.ts unit test (allow policy, sitemap
  ref, employer/candidate/admin disallowed), sitemap test (guides present),
  JSON-LD render test for one guide (Article + FAQPage parse as valid JSON).
- `npm run test:distribution` must stay green — this spec must not touch
  distribution logic.

## Commit plan (self-contained blocks per standing rule)

1. `seo: add Organization/WebSite JSON-LD + JobPosting audit fixes` (Phase 2)
2. `feat: /guides section with 3 pillar pages + sitemap entries` (Phase 3 —
   include the guide content files, the index page, sitemap.ts edit, tests)
3. `seo: llms.txt + AI-crawler check` (Phase 4)
4. `launch: drop pre-launch noindex lockdown` (Phase 1 — **HOLD until Cam's
   explicit go after data scrub**)
