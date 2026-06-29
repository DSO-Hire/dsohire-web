# Demo Handoff for Cowork — 2026-06-29

Everything Cowork needs to write the **Demo_Runbook** / film product videos. The
rich demo seed is built, verified (36/36 wow-beat checks green), and live in
production. This doc is the source of truth for personas, click paths, and the
reset flow.

---

## ⚠️ The big change since last time: logins are demo accounts, not Cam's email

**Before:** Cam drove the employer side from his own owner account (his email).

**Now:** the hero DSO (Bridgeway) and every other DSO are owned by **dedicated
demo accounts** under `@demo.dsohire.com`. Cam's personal email
(`cameron@eslingerdental.com`) is used in **exactly one place** — the founder
`/admin` command center (and the reset button + read-only "view as"). It is no
longer a DSO owner.

So a demo session uses **two identities**:
1. **Founder/admin** (`cameron@eslingerdental.com`) → `/admin` only — the
   command center, Vantage analytics, view-as, and the **Reset demo data** button.
2. **A demo employer account** (e.g. `bridgeway.owner@demo.dsohire.com`) →
   `/employer/...` — the actual prospect-facing hiring UI you demo.

Tip: drive the employer/candidate demo in an **incognito / separate browser
profile** so you're not simultaneously logged in as the admin. Switching is just
a sign-in, but separate profiles keep the two identities clean on camera.

---

## Environment facts

- **Project:** `dsohire-prod` (`viapivvlhjqvjhoflxmp`), behind `dsohire.com`,
  gated + noindexed (pre-launch). This project **is** the demo.
- **Everything is fictional.** No real people, no real company names. EEO is
  never seeded or surfaced. Candidate masking/consent is real.
- **Hero DSO:** Bridgeway Dental Partners — public page `/bridgeway-dental-partners`.
- **Reset scope marker:** every seeded row is `seed_batch='demo_v1'`. The reset
  touches only those rows (asserted).

---

## Logins (shared password: `DsoHireDemo!2026`)

**Sign-in URLs:** employers → `/employer/sign-in` · candidates →
`/candidate/sign-in` · founder admin → `/admin` (signed in as the email below).

### Founder / admin
- `cameron@eslingerdental.com` — `/admin` command center, Vantage, view-as,
  **Reset demo data**. (Cam's real account; not recreated by the seed.)

### Employers (one per tier — log into the one matching the prospect's scale)
| Tier | DSO | Name | Email |
|---|---|---|---|
| Solo | Cedarwood Dental | Dana Albright | `cedarwood.owner@demo.dsohire.com` |
| Growth | Lakeshore Dental Group | Marcus Hale | `lakeshore.owner@demo.dsohire.com` |
| **Scale (HERO)** | **Bridgeway Dental Partners** | Olivia Brandt | `bridgeway.owner@demo.dsohire.com` |
| Scale (recruiter seat) | Bridgeway Dental Partners | Devin Park | `bridgeway.recruiter@demo.dsohire.com` |
| Enterprise | Summit Dental Group | Renée Castellano | `summit.owner@demo.dsohire.com` |
| Scale | Riverstone Dental Partners | Priya Nayar | `riverstone.owner@demo.dsohire.com` |

### Candidates
| Role in demo | Name | Email |
|---|---|---|
| Two-sided pair (anonymous-discoverable) | Maria Lopez | `candidate.maria@demo.dsohire.com` |
| Named / applied candidate | Jordan Bailey | `candidate.jordan@demo.dsohire.com` |

The other ~70 candidates are profile accounts (passwordless) — they populate the
talent pool and search; you don't log in as them.

---

## What's in the demo (the wow-beats) + where to click

Log in as **`bridgeway.owner@demo.dsohire.com`** for all of the employer beats.

### 1. Dashboard — `/employer/dashboard`
"Today" snapshot + **Next-Best-Actions**: a high-fit candidate, an SLA-breached
new application (>5 days), a stalled mid-pipeline cluster (>14 days in stage),
and "offers out." KPI cards (applications/week, time-to-fill, etc.) read off
backdated data so they look alive. *(First load in a fresh session can take a
few seconds while server data streams.)*

### 2. Pipeline / kanban — open a job → Applications
The Associate Dentist job has the fullest board (8 applicants). Candidates sit in
**every stage** — New, Screening, Interview, Offer, Hired — plus closed
(Rejected with dispositions, Withdrawn). Aging pills show cool/warm/hot. Drag a
card to move it (optimistic + realtime).

### 3. Conversations + notes
Several applications have a candidate↔employer message thread plus an internal
team note. Open an application detail to show both.

### 4. Scorecards + interviews
Submitted scorecards and scheduled interviews (proposal → booked) on several
mid-pipeline candidates.

### 5. Offers
≥1 offer **sent and awaiting response** ("offers out"), and ≥1 **accepted with a
typed-name signature** → that candidate is Hired.

### 6. Credentialing
≥1 candidate has a license expiring inside 30/60 days (+ one expired) so the
credentialing roll-up / digest shows something.

### 7. Talent pool / sourcing — `/employer/talent-pool`
Saved candidates, a mix of **masked (anonymous)** and **named** profiles, and a
live **double-blind prospect thread** mid-conversation with Maria Lopez.

### 8. Vantage analytics — founder admin → `/admin/analytics`
~30 days of backdated pageviews + signup/checkout goals; channels, top pages,
acquisition loop all populated.

### 9. Public job board — `/jobs`
- **Practice Roles** tab: chairside + office roles across the Front Range.
- **Corporate Roles** tab: **13 corporate/DSOFit roles across 9 functions**
  (Director of Operations, Revenue Cycle Manager, IT Director, Controller,
  Talent Acquisition Manager, BD & M&A, Compliance & Credentialing, Marketing,
  Procurement, etc.). Use the function chips to filter.

---

## The killer two-sided demo (Maria ↔ Bridgeway)

1. **As the Bridgeway owner** (`bridgeway.owner@demo.dsohire.com`): open the
   Talent Pool / Discover. Maria Lopez shows **masked** — rich profile (years,
   skills, license, ~98 PracticeFit) but **no name or photo**. There's also a
   live double-blind prospect thread with her.
2. **Switch to Maria** (`candidate.maria@demo.dsohire.com`, incognito): she
   applies to (or reveals to) Bridgeway.
3. **Back as Bridgeway:** her identity is now revealed **to Bridgeway only** —
   the consent/masking model in action.

---

## Employer-side privacy (the company's own anonymity) — at Bridgeway

Three real demonstrations live on the public board:
- **Affiliation masking** — an Associate Dentist posting shows the practice
  brand "**Cherry Creek Dental Studio**" instead of "Bridgeway Dental Partners."
  (Public board + detail page. The real group reveals to the DSO only after the
  candidate applies — `affiliation_reveal_policy = per_application`.)
- **Name anonymization** — a Hygienist posting shows "**Dental Office in
  Denver**" (location name fully anonymized).
- **Confidential executive search** — "**Chief Operating Officer (Confidential
  Search)**" on the Corporate tab shows the employer as "**Multiple locations**"
  publicly, and internally is visible only to the owner + the assigned recruiter
  (Devin Park). Log in as `bridgeway.recruiter@...` to show the assigned-teammate
  view.

---

## Resetting between demos

Two ways — both wipe only `seed_batch='demo_v1'` rows and reseed identically.
Logins and passwords stay the same after a reset.

### A. The button (fastest, no terminal) — recommended for between takes
1. Sign in to **`/admin`** as `cameron@eslingerdental.com` (founder).
2. Scroll to the bottom → the **"Demo controls · founder-only"** card →
   **Reset demo data**.
3. Confirm the dialog. It runs ~30–60s and shows a success line with the row
   counts. The environment is back to pristine (any cards you dragged, messages
   you sent, etc. are reverted).

### B. The script (full rebuild incl. re-uploading headshots/logos)
From the repo with service-role env set (gitignored `.env.seed.local`):
```
npm run seed:demo     # wipe demo_v1 + reseed
npm run verify:demo   # asserts all 36 wow-beats — must print "36 passed, 0 failed"
```

---

## Confidence check

`npm run verify:demo` is the green-light: it asserts every beat above exists
(all stages populated, SLA-breach, stalled, offers out + accepted, conversations,
credentialing, ≥95 fit, the two-sided pair, the corporate-tab richness, and the
confidential/masked jobs). If a reset ever leaves the demo thin, this fails loudly.
