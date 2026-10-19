# DSO Hire outreach kit (October 2026)

Goal: the first paying dental groups. Two nets, both personal, no blasts.

1. **Warm network** (people Cam knows): highest conversion, goes first.
2. **Targeted cold** (the researched prospect list, `prospects-2026-10.csv`): 10–15 hand-personalized emails a day, each tied to that group's real hiring situation.

**Pricing stance (Cam, 2026-10-19):** lead with value, no discount. A founding-customer offer is the fallback only if this campaign gets no traction after a fair run (suggested: 3 weeks, 60+ personalized touches).

---

## Before the first send

- [ ] **Turn on DKIM for cam@dsohire.com.** SPF and DMARC are already set; the mailbox's DKIM signature is missing. In GoDaddy: Email & Office dashboard → the dsohire.com mailbox → advanced / DNS settings → enable DKIM (or ask GoDaddy support "enable DKIM signing for my domain"). Without it, cold mail to Microsoft 365 / Google Workspace inboxes is more likely to land in spam.
- [ ] **Send from your own mailbox, by hand,** not a bulk tool. 10–15 a day max at first.
- [ ] **Every email gets its own demo link:** `https://demo.dsohire.com/demo?for=Group+Name`. You get an email the moment they open it, and their demo says "Prepared for Group Name".
- [ ] **Signature:** name, title (Founder, DSO Hire), dsohire.com, and a mailing address. A physical address and an easy opt-out line are required for commercial email (CAN-SPAM).

---

## 1. Warm network

### A. People who run or work inside a dental group

> Subject: built something for groups like {Group}
>
> Hi {First},
>
> Hope things are good at {Group}. Quick one: after ten years on the business side of dentistry I built DSO Hire, a hiring platform just for dental groups. One flat monthly fee covers every location, there are no per-listing or placement fees, and every applicant gets a fit score against how your practices actually run.
>
> I'd value your honest take, even if it's "not for us." Here's a live version you can click around, no sign-up: {demo link}
>
> If it's useful, I'm happy to walk you through it for 15 minutes. If not, tell me what's missing; that's just as valuable right now.
>
> {Cam}

### B. People who know the right people (consultants, vendors, former colleagues)

> Subject: quick favor?
>
> Hi {First},
>
> I launched DSO Hire, a flat-fee hiring platform built only for multi-location dental groups (no placement fees, no per-listing fees). I'm looking for a few operators who are hiring across several offices and would give it an honest look.
>
> Who's the one person you'd introduce me to? A name is plenty; I'll take it from there and mention you sent me.
>
> Live demo if you're curious: {demo link}
>
> Thanks either way,
> {Cam}

### C. The forwardable intro (send to anyone who says "sure, I'll intro you")

> {Name}, meet Cam Eslinger. He spent ten years on the business side of dentistry and built DSO Hire, a hiring platform just for dental groups: one flat fee across every location, no placement fees, and fit scoring on every applicant. Thought it could be useful given how much {Group} is hiring. Cam, over to you.

---

## 2. Targeted cold (from the prospect list)

**The rule:** every email opens with something true and specific about *them* (from `hiring_signal` / `growth_signal` in the CSV, with its source). If you can't name a specific reason, don't send yet.

### First touch

> Subject: {Group}'s {open roles / new offices}
>
> Hi {First},
>
> {Specific, sourced observation, e.g. "Saw {Group} is adding three Michigan offices this year, and your careers page has 20-plus open hygiene and assistant roles right now."}
>
> Groups growing like that usually end up paying for every listing at every office, or a 15–25% agency fee on the hard-to-fill roles. DSO Hire is one flat monthly fee for every location: post once to all of them, run one pipeline, no placement fees.
>
> I set up a live demo for {Group}. It's the real product, nothing to sign up for: {demo link}
>
> Worth 15 minutes to see whether it fits how you hire?
>
> {Cam}
> Founder, DSO Hire
>
> *Not the right person? Tell me who is, or reply "no thanks" and I won't follow up.*

### Follow-up 1 (day 3–4, same thread)

> Hi {First}, one concrete thing in case it's useful: here's the cost math for a group your size, with your numbers pre-filled: {calculator link}. Takes about 30 seconds to adjust.

### Follow-up 2 (day 8–10, same thread, last one)

> Hi {First}, I'll leave it here. If hiring across your offices ever gets painful, the demo stays open: {demo link}. And if someone else at {Group} owns recruiting, I'd be grateful for a name.

**Calculator link with their numbers pre-filled** (they land on their own estimate):
`https://dsohire.com/for-dental-groups?loc={locations}&hires={est_hires_per_year}&ag=30&fee=25000&lst={est_open_listings}&cpl=350#calculator`
(Use `approx_locations` from the CSV; hires ≈ 1.5× locations is a reasonable starting guess; listings ≈ their open roles. Say "estimated" if you mention a number.)

### LinkedIn (connection note, 300 characters max)

> Hi {First}, I built DSO Hire, a flat-fee hiring platform just for multi-location dental groups. Noticed {Group} is {growing/hiring across offices}. Would love to connect, and here's a live demo if you're curious: {demo link}

---

## 3. When they reply or open

- **Demo-open email arrives** ("{Group} just opened the live demo"): reply in the same thread **that day**. Something like "Saw you had a look. Anything you'd want to see for {Group} specifically?" Don't say you were notified.
- **"Send me pricing":** link `https://dsohire.com/pricing` plus one line on the tier that fits their size (Solo 2–5 locations, Growth up to 20 active listings, Scale up to 100, Enterprise unlimited). Offer the 15-minute call.
- **"We use Indeed / an agency":** they don't have to stop. Most groups start by moving their routine roles (hygiene, assistants, front desk) off per-listing boards and keep the agency for the rare executive search.
- **"We already have an ATS":** what changes is the cost model and the dental-native pieces (comp models that understand guarantees and production %, PracticeFit, anonymous candidate sourcing). Ask what they'd fix about their current setup.
- **"Too early / no budget":** ask permission to check back in a quarter. Note it in the tracker.
- **No reply after follow-up 2:** stop. Move to the next prospect.

---

## 4. Tracking

Keep a simple sheet: group, contact title, date sent, follow-up 1, follow-up 2, opened demo (from the alert emails / `/admin/leads`), replied, call booked, outcome.

**Success signal by week 3:** 60+ personalized touches → a handful of demo opens from named groups → 2–4 calls. If the touches go out and there are no opens and no calls, revisit the message first, then the founding-offer fallback.
