# Job Distribution — go-live runbook

Distribution rails (syndication XML feed, public jobs API, embeddable widget +
iframe, and dynamic job/company sitemap entries) are **built but dark**. This
doc is the procedure to turn them on. Reading or running anything here changes
nothing on its own — going live requires the explicit env + data steps below.

## Why it's gated

We are pre-launch with seeded/test data. Feeding fake jobs to Indeed / Google
for Jobs / LinkedIn risks a structured-data policy strike against the whole
domain. So distribution stays off until launch **and** until the seed/test data
is scrubbed.

## The three locks (all must be released to emit a single job)

| Lock | Where | Default | Releases when |
| --- | --- | --- | --- |
| `PREVIEW_GATE_DISABLED` | env (Vercel) | unset (gate on) | site launch |
| `DISTRIBUTION_LIVE` | env (Vercel) | unset (off) | after the data scrub, deliberately |
| `dsos.is_demo` | DB column | `true` on every DSO that existed at build time | per-DSO, only for a verified-real DSO |

Logic: `src/lib/launch/gate.ts` → `isDistributionLive()` returns true only when
`PREVIEW_GATE_DISABLED === "true"` **and** `DISTRIBUTION_LIVE === "true"`. On top
of that, `public.list_distribution_jobs()` excludes `is_demo = true` DSOs. So
even with both env flags on, a DSO still won't distribute until its `is_demo` is
cleared.

## Go-live sequence

1. **Launch the site** — set `PREVIEW_GATE_DISABLED=true` (drops the coming-soon
   gate). Distribution is still dark (`DISTRIBUTION_LIVE` still unset).
2. **Scrub seed/test data** — delete demo DSOs/jobs, or confirm they keep
   `is_demo = true`. Verify nothing real is mis-flagged.
   ```sql
   -- everything that should distribute must be is_demo = false:
   select slug, name, status, is_demo from public.dsos where deleted_at is null order by created_at;
   ```
3. **Un-flag the real DSOs** — for each verified-real DSO:
   ```sql
   update public.dsos set is_demo = false where slug = '<real-dso-slug>';
   ```
   (New DSOs that sign up *after* this migration already default `is_demo = false`.)
4. **Flip distribution on** — set `DISTRIBUTION_LIVE=true`.
5. **Relax indexing** (needed for Google for Jobs to crawl the job pages):
   - remove the site-wide `robots` noindex block in `src/app/layout.tsx`
   - replace the blanket `disallow: "/"` in `src/app/robots.ts` with the real
     policy (allow crawl + re-add the sitemap reference)
6. **Verify** (see below), then **submit feeds**:
   - **Indeed:** add an XML feed source pointing at `https://dsohire.com/feeds/jobs.xml`
     (or a per-DSO `https://dsohire.com/feeds/companies/<slug>/jobs.xml`).
   - **LinkedIn:** share the same feed URL for Limited Listings / job wrapping.
   - **Google for Jobs:** nothing to submit — it indexes the `JobPosting`
     JSON-LD on `/jobs/[id]` once the pages are crawlable and in the sitemap.

## Verify after flipping

```sql
-- should now return only real, non-demo, active/public/non-confidential jobs:
select count(*) from public.list_distribution_jobs(null);
```
- `GET /feeds/jobs.xml` — contains only real jobs; spot-check that no
  private-affiliation job shows the corporate DSO name.
- `GET /api/public/companies/<slug>/jobs.json` — masked, CORS works cross-origin.
- `GET /embed/companies/<slug>` — renders; embeddable on a third-party origin.
- `/sitemap.xml` — now includes real job/company URLs (and only those).
- Validate a `/jobs/[id]` page in Google Rich Results — JobPosting is valid.

## Rollback (instant kill switch)

Unset `DISTRIBUTION_LIVE` (or set it to anything other than `"true"`). Every
distribution surface returns empty/zero on the next request — no deploy needed.
Already-submitted feed URLs simply return an empty feed.

## Guardrails (enforced in code; do not weaken)

- Single source of truth: `getPublicJobsForDistribution()` /
  `public.list_distribution_jobs()`. Add new surfaces through it, never a
  parallel query.
- Confidential + `internal_only` + `distribution_enabled = false` jobs are
  always excluded; comp is emitted only when `compensation_visible`; private
  affiliation never reveals the real DSO name; no candidate/PII fields.
- Smoke tests: `npm run test:distribution` (asserts pre-launch-empty, demo
  denylist, masking, comp hiding, no PII). Run in CI / before any change here.
