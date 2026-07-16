/**
 * /faq — the public, comprehensive FAQ. Single source of truth for the
 * platform's most-asked questions across both audiences (dental groups +
 * dental professionals), plus PracticeFit/DSOFit, privacy, and support.
 *
 * Every answer is grounded in real platform behavior — pricing from
 * src/lib/stripe/prices.ts, caps from the enforced tier limits, PracticeFit
 * as ONE track-walled engine (never two facing scores), distribution stated
 * honestly (on-platform + Google for Jobs today; aggregators roadmap), and
 * US-only scope. Do not add claims the platform doesn't actually make.
 *
 * The same FAQ_CATEGORIES array feeds both the on-page accordions and the
 * FAQPage JSON-LD (schema.org) so the structured data can never drift from
 * what's rendered. Mirrors the FaqAccordion/JSON-LD pattern already used on
 * /pricing, /for-dental-groups, /for-candidates, and /salary.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/marketing/site-shell";
import { FaqAccordion, type FaqItem } from "@/components/marketing/faq-accordion";

export const metadata: Metadata = {
  title: "FAQ · Frequently Asked Questions",
  description:
    "Answers about DSO Hire: pricing and plans, posting jobs, applying, PracticeFit & DSOFit scoring, candidate privacy, data, and support. The dental-only hiring platform for multi-location groups and dental professionals.",
  alternates: { canonical: "https://dsohire.com/faq" },
  openGraph: {
    title: "DSO Hire · Frequently Asked Questions",
    description:
      "Everything about DSO Hire in one place: pricing, posting and managing jobs, applying, PracticeFit scoring, privacy controls, and support.",
    url: "https://dsohire.com/faq",
    type: "website",
  },
};

/* ═══════════════════════════════════════════════════════
   CONTENT — grounded in real platform behavior
═══════════════════════════════════════════════════════ */

interface FaqCategory {
  id: string;
  label: string; // short label for the jump nav
  eyebrow: string;
  title: string;
  items: FaqItem[];
}

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "basics",
    label: "The basics",
    eyebrow: "Start here",
    title: "The basics",
    items: [
      {
        q: "What is DSO Hire?",
        a: "DSO Hire is the dental-only hiring platform. It connects multi-location dental groups (DSOs) directly with dental professionals: no staffing agencies, no per-listing fees, no middlemen. For groups it's a complete applicant tracking system; for candidates it's a free, private way to find a practice that actually fits.",
      },
      {
        q: "How is DSO Hire different from Indeed, ZipRecruiter, or a general job board?",
        a: "General job boards serve every industry and charge per listing or per click. DSO Hire is dental-only and a full hiring system: not a job board with an inbox, but a real ATS with pipeline management, dental-specific screening, fit scoring, offers, and analytics, all included in one flat fee. Candidates get dental-only listings and privacy controls a general board doesn't offer.",
      },
      {
        q: "Is DSO Hire a staffing or recruiting agency?",
        a: "No, we're the opposite. There's no recruiter in the middle taking a placement fee. Candidates apply directly to the dental group's hiring team, and groups hire without paying 20–30% of a first-year salary. DSO Hire charges a flat subscription, never a placement fee.",
      },
      {
        q: "Who is DSO Hire for?",
        a: "Two audiences, one platform. Dental groups: multi-location operators and DSOs who post roles and hire across their practices. Professionals: everyone in dentistry, including dentists, specialists, hygienists, assistants, front-office staff, and corporate/DSO roles. It's purpose-built for multi-location groups; a single-location office can use it, but the multi-location backbone is where it shines.",
      },
      {
        q: "Is DSO Hire really dental-only?",
        a: "Yes, on purpose. Every listing, screening question, fit dimension, and pay benchmark is built for dentistry, from practice-management-software fluency to state hygiene licensure. We don't dilute the platform with other industries.",
      },
      {
        q: "Is this for permanent hires or temp/shift work?",
        a: "DSO Hire is for direct, permanent hiring: full-time and permanent part-time roles you bring onto your team. We're not a temp-shift marketplace and not an employer of record; you hire the person directly and they join your payroll. If you need same-day shift coverage, a temp app is a better fit.",
      },
      {
        q: "What does “done direct” mean?",
        a: "It means the hire happens directly between the dental group and the professional: no agency introduction fee, no recruiter reselling applications, no per-listing charges. Just the two sides who actually matter, connected.",
      },
      {
        q: "How do I know the jobs are real?",
        a: "Every employer on DSO Hire is a dental group that subscribes to the platform and agrees to our Acceptable Use Policy. Staffing-agency middlemen, recruiter reposts, and duplicate listings posted to inflate visibility are prohibited, and we remove anyone in violation. When you apply, it goes to the group's actual hiring team.",
      },
      {
        q: "Where is DSO Hire available?",
        a: "DSO Hire operates in the United States. Listings use US state licensure and pay benchmarks, and the service is hosted and operated from the US (DSO Hire LLC, Prairie Village, Kansas).",
      },
      {
        q: "Do I need to download an app?",
        a: "No download required. DSO Hire is a fast, responsive web app that works on any phone, tablet, or computer. Just sign in from your browser.",
      },
    ],
  },
  {
    id: "employers",
    label: "For dental groups",
    eyebrow: "For dental groups",
    title: "Pricing, posting & managing your pipeline",
    items: [
      {
        q: "How much does DSO Hire cost?",
        a: "DSO Hire is a flat monthly subscription: no per-listing fees, no placement fees, ever. Four plans scale with your group: Solo ($399/mo) for privately-owned groups of 2–5 locations, Growth ($699/mo) for growing groups and DSOs, Scale ($1,499/mo) for multi-location groups built for scale, and Enterprise ($2,999/mo) for 35+ practices with account management included. Annual billing saves roughly 10%, about a month and a half free.",
      },
      {
        q: "Do you charge per-listing fees, placement fees, or commissions?",
        a: "None of the above, ever. You pay one flat subscription and hire as many people as you want. There's no charge per job posting and no percentage of anyone's salary when you make a hire.",
      },
      {
        q: "What's included in the subscription?",
        a: "Everything. Every plan includes the full ATS: a drag-and-drop pipeline with real-time team sync, 130+ curated dental screening questions with knockouts, PracticeFit and DSOFit scoring, templated offer letters with e-signature, analytics with pay benchmarks, confidential searches, and the in-app AI assistant. Your plan sets your active-openings and team-seat limits, not which features you get.",
      },
      {
        q: "How many open roles and team members do I get on each plan?",
        a: "Solo: 5 active openings and 5 seats. Growth: 20 openings and 15 seats. Scale: 100 openings and 50 seats. Enterprise: unlimited. Openings are concurrent active roles, not lifetime posts; closing a filled role frees its slot instantly. Need more seats? You can add them to any plan. Every advertised cap is the enforced cap: what we show is exactly what the platform allows.",
      },
      {
        q: "Is there a free trial?",
        a: "Not currently, but there's no setup fee either, so you can sign up, pay through Stripe, and be live in minutes with no implementation project. If you'd like to see it first, book a 15-minute call at sales@dsohire.com. No demo gauntlet, no sales script.",
      },
      {
        q: "How does billing work, and can I change plans?",
        a: "Groups pay monthly or annually through Stripe (all major credit cards; ACH and net-30 invoicing available for Enterprise). You can move up or down a plan anytime and Stripe prorates the difference automatically.",
      },
      {
        q: "How do I cancel? Do you offer refunds?",
        a: "Cancel anytime from your billing settings. You keep full access through the end of the period you've already paid for, and we don't lock you into long contracts. For any billing question, email sales@dsohire.com.",
      },
      {
        q: "How do I post a job, and can I post across multiple locations?",
        a: "Posting is a short guided flow: basics, description, compensation, screening, then status. You can save a draft and finish later; nothing goes live until you set it Active. To hire across practices, write the role once and select which locations it applies to; DSO Hire renders a listing for each, so posting to fifteen practices takes the same effort as one.",
      },
      {
        q: "Where do my jobs get distributed and who sees them?",
        a: "Every DSO Hire job is searchable across the platform and published to Google for Jobs, so it surfaces in Google search results. Direct syndication to aggregators like Indeed and LinkedIn is on our roadmap for later in 2026. We'd rather tell you that plainly than imply reach we don't have yet.",
      },
      {
        q: "How do I review and manage applicants?",
        a: "Applicants land on a drag-and-drop kanban pipeline with stages you can rename and reorder. Every card shows the candidate's profile, resume read, screening answers, knockout flags, and PracticeFit score. Teammates' moves sync in real time, bulk actions let you move or reject in one go, and you're notified when someone applies. It's a real ATS, not an inbox.",
      },
      {
        q: "Can I control what each team member can see and do?",
        a: "Yes. Roles range from Owner (full control plus billing) to Admin, Recruiter, and Hiring Manager (scoped to their assigned locations). Billing, team management, and EEO data can never be granted to recruiters or hiring managers. You can also run confidential searches restricted to named teammates, enforced at the database level, so the role simply doesn't exist for anyone off the list.",
      },
      {
        q: "How fast can we get set up?",
        a: "Fast. Sign up, choose a plan, pay through Stripe, and your account is live in minutes; most dental groups post their first role within an hour of signing up. There's no setup fee and no implementation project.",
      },
      {
        q: "Is DSO Hire right for a single-location practice?",
        a: "You can use it, but we'll be honest: DSO Hire is built for multi-location operators, and a single-practice office hiring once a year won't get full value from the multi-location backbone yet. If you run several locations, or plan to, it's built for you.",
      },
    ],
  },
  {
    id: "candidates",
    label: "For professionals",
    eyebrow: "For dental professionals",
    title: "Applying, profiles & getting hired",
    items: [
      {
        q: "Is DSO Hire free for job seekers?",
        a: "Completely free, forever. Dental groups pay the subscription; candidates never pay to apply, never pay to be visible, and never see ads. There's no premium candidate tier, and we never resell your resume.",
      },
      {
        q: "What roles can I find on DSO Hire?",
        a: "The whole dental org chart. Clinical: general dentists and specialists (endo, perio, pedo, oral surgery, ortho), hygienists, dental assistants and EFDAs, dental therapists, sterilization techs, and lab techs. Front office: treatment, financial, and scheduling coordinators, office managers, and practice administrators. And corporate/DSO roles (finance, HR, marketing, IT, operations, business development, and executive), scored on the DSOFit track.",
      },
      {
        q: "How do I apply to a job?",
        a: "Applying takes about three minutes: one clear question at a time, with your answers saving as you go. If you've imported a resume, your profile pre-fills the details. Your information is shared only with the group you apply to, and only when you apply.",
      },
      {
        q: "Do I have to upload a resume, or can the platform read it?",
        a: "You don't have to, but you can. Upload a resume and DSO Hire reads it into your profile, and you review and edit every field before anything saves. The parser deliberately ignores sensitive data like Social Security numbers or dates of birth even if they appear on the document.",
      },
      {
        q: "Is there a free resume builder?",
        a: "Yes, and it's free forever with no watermarks. Choose from six ATS-safe dental templates, export a real PDF, and use it anywhere, even off DSO Hire. It auto-attaches when you apply, and you can build one mid-application if you don't have one ready.",
      },
      {
        q: "What happens after I apply?",
        a: "Your application goes directly to the hiring team at the dental group, with no recruiter in between. You'll get status updates in your candidate dashboard and by email as they review, interview, and decide.",
      },
      {
        q: "How do I check my application status?",
        a: "Your dashboard shows the stage the employer chooses to share, from Submitted through Interview and Offer. If a group keeps its pipeline private, you'll simply see “In review.” We don't show anxiety-inducing day counters, and if you're not moving forward, we tell you honestly rather than leaving you guessing.",
      },
      {
        q: "Can I apply to more than one job?",
        a: "Absolutely. Build your profile once and apply to as many roles as you want without re-uploading your resume each time. Each application shares your profile only with that specific group.",
      },
      {
        q: "Do I need to be licensed, and do you verify credentials?",
        a: "You enter your licensure, certifications, and skills as part of your profile, and PracticeFit factors state licensure into role matching. DSO Hire isn't an employer of record; final license and credential verification and any background checks are handled by the hiring group as part of their process.",
      },
      {
        q: "Can students or new grads use DSO Hire?",
        a: "Yes, dental professionals at every experience level are welcome (you must be 18+ and eligible to work in the US). Because PracticeFit drops missing information out of the math instead of counting it against you, an early-career profile is never penalized for being thin.",
      },
    ],
  },
  {
    id: "practicefit",
    label: "PracticeFit & DSOFit",
    eyebrow: "Fit scoring & AI",
    title: "PracticeFit, DSOFit & how matching works",
    items: [
      {
        q: "What are PracticeFit and DSOFit?",
        a: "They're two faces of one fit-scoring engine. PracticeFit scores clinical and practice-side roles; DSOFit scores corporate and HQ-side roles. They're track-separated (a candidate is only ever scored against roles in their own world), so you never get a clinical score held up against a corporate job.",
      },
      {
        q: "How does the fit score work?",
        a: "The score (1–100) weighs the things that actually predict fit: role match, real commute distance, practice-management-software fluency, state licensure, compensation alignment, specialty, skills, and schedule. Missing information drops out of the math instead of counting against you (a thin profile is never penalized), and every score comes with a plain-English “why.”",
      },
      {
        q: "Does a low score stop me from applying or get me auto-rejected?",
        a: "No. PracticeFit is a guidance score, never a gate: it never blocks you from applying and never auto-rejects anyone. Employers can add optional “knockout” screening questions, but those are soft too: a mismatch flags the application for a human to review, it never rejects you automatically.",
      },
      {
        q: "Can I see my own score, and can I improve it?",
        a: "Yes. You can always see your score and the reasons behind it, and you can rank what matters most to you (pay, location, schedule), which tilts the scoring toward your priorities. Filling in more of your profile generally sharpens the match.",
      },
      {
        q: "Does the employer see the same score I see?",
        a: "It's one engine, so the underlying fit is consistent, but it's a decision aid on both sides, not a verdict. Employers see it as guidance alongside your full profile, resume, and answers; it never ranks you into or out of a role on its own.",
      },
      {
        q: "Is the matching fair? Does it use protected characteristics?",
        a: "The score is built only from job-relevant factors (licensure, skills, location, experience, and your stated preferences) and never from protected characteristics. Voluntary EEO information is stored in a separate system with no employer read path at all. And because missing data is dropped rather than guessed, the engine never penalizes an incomplete profile.",
      },
      {
        q: "Do I have to use PracticeFit?",
        a: "No, it's your call. PracticeFit has three settings: Full (compute it and show it on your profile), Results-only (compute it, but only show it on jobs you've applied to), or Off (don't compute it at all).",
      },
    ],
  },
  {
    id: "privacy",
    label: "Privacy & data",
    eyebrow: "Privacy, data & security",
    title: "Your privacy and your data",
    items: [
      {
        q: "Who can see my profile and resume?",
        a: "You control it. Separate settings govern your profile, resume, and contact info: you can keep each private, share it only after you apply, limit it to DSO Hire employer members, or make it public. By default your profile is private, and unauthenticated visitors and search engines never see your name or contact details.",
      },
      {
        q: "Can I keep my search confidential from my current employer?",
        a: "Yes, and this is core to why we exist. You can hide your profile from any group you list as a current employer, and it's enforced automatically. Working hygienists tell us it's the number-one reason they hesitate to job-search; DSO Hire is built so a confidential search stays confidential.",
      },
      {
        q: "Can I browse anonymously and hide my name until I choose to reveal it?",
        a: "Yes. Turn on anonymous browsing and employers searching the talent pool see a generic label like “Dental Assistant in Denver” instead of your name or photo. Your experience, skills, and PracticeFit stay visible so groups can still find you, and the moment you apply to one of their roles, your full profile reveals to that group only.",
      },
      {
        q: "Can I block specific practices or DSOs?",
        a: "Yes. You can add DSOs to a block list (up to 100) and they won't see you in the talent pool. At launch this works at the practice level; corporate-parent rollup (blocking every practice under one owner at once) is a follow-up.",
      },
      {
        q: "Do you sell or share my data with recruiters or data brokers?",
        a: "Never. We don't sell candidate data to anyone (not data brokers, not staffing agencies), and there's no resume-reselling business behind the free candidate side. Your data is also never used to train AI models.",
      },
      {
        q: "What data do you collect, and what do you deliberately not collect?",
        a: "We collect what's needed to match you to jobs: your experience, skills, licensure, preferences, and the resume you choose to share. We deliberately do not collect Social Security numbers, driver's licenses, dates of birth, DEA/NPI numbers, protected-class characteristics, or financial details, and our forms reject them even in free-text fields.",
      },
      {
        q: "How is my data secured, and where is it hosted?",
        a: "DSO Hire is hosted in the United States on vetted infrastructure (Vercel for hosting, Supabase/AWS for the database, Stripe for payments). Sensitive access is walled off (voluntary EEO data has no employer read path), and your data is never used to train AI models. Our Security & Trust page lists our sub-processors and what's on the roadmap.",
      },
      {
        q: "How do I download or delete my data and account?",
        a: "Any time. From Settings → Data you can export your full data or delete your account outright, candidates and employer owners alike. Deletion is real deletion, subject only to limited legal retention such as billing records.",
      },
    ],
  },
  {
    id: "support",
    label: "Accounts & support",
    eyebrow: "Accounts & support",
    title: "Accounts, help & reporting",
    items: [
      {
        q: "How do I create an account?",
        a: "Candidates create a free account from the For Candidates page. Dental groups start from Pricing or For Dental Groups, choose a plan, and pay through Stripe to activate; you're live in minutes.",
      },
      {
        q: "I forgot my password or can't sign in.",
        a: "Use the “Forgot password” link on the sign-in page to get a reset email. If you're still stuck, email support@dsohire.com and we'll help you back in.",
      },
      {
        q: "How do I contact support?",
        a: "Email us: support@dsohire.com for help, sales@dsohire.com for pricing and plans, or info@dsohire.com for anything else. They all reach the same team, and we aim to reply the same business day.",
      },
      {
        q: "How do I report a fake job, spam, or a policy violation?",
        a: "Email support@dsohire.com with the job or profile in question. Fake listings, recruiter reposts, agency spam, and harassment all violate our Acceptable Use Policy, and we investigate and remove violators.",
      },
      {
        q: "Can I pause or deactivate my account?",
        a: "Yes. Candidates can set their profile to private to effectively pause a search without losing their data, or delete the account entirely from Settings → Data. Employers can cancel a subscription anytime and keep access through the end of the billing period.",
      },
      {
        q: "How do I change my role or add a fit track?",
        a: "From your candidate settings you can switch or add a fit track: for example, moving from a clinical role to front office, or adding the corporate (DSOFit) track if you're eyeing an HQ position. Clinical-to-corporate movers are first-class here: a dentist eyeing an executive seat is scored on the corporate dimensions that apply.",
      },
    ],
  },
];

// One flat list for the FAQPage structured data — built from the exact same
// content the accordions render, so schema and page can never disagree.
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  ),
};

/* ═══════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════ */

export default function FaqPage() {
  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* HERO + JUMP NAV */}
      <section className="pt-[140px] pb-14 px-6 sm:px-14">
        <div className="max-w-[860px] mx-auto">
          <div className="flex items-center gap-3.5 mb-8">
            <span className="block w-7 h-px bg-heritage" />
            <span className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep">
              Help Center
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-7 max-w-[720px]">
            Frequently asked{" "}
            <em className="not-italic text-heritage-light">questions.</em>
          </h1>
          <p className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[620px]">
            Everything about DSO Hire in one place: pricing, posting and
            applying, PracticeFit scoring, privacy, and support. Straight
            answers, no fine print.
          </p>

          {/* Category jump nav */}
          <nav className="flex flex-wrap gap-2.5 mt-10" aria-label="FAQ categories">
            {FAQ_CATEGORIES.map((cat) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="text-[13px] font-semibold text-ink border border-[var(--rule-strong)] rounded-full px-4 py-2 hover:bg-hero hover:text-hero-foreground hover:border-hero transition-colors"
              >
                {cat.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* CATEGORY SECTIONS */}
      {FAQ_CATEGORIES.map((cat, i) => (
        <section
          key={cat.id}
          id={cat.id}
          className={`scroll-mt-28 px-6 sm:px-14 py-16 ${
            i % 2 === 1 ? "bg-cream border-y border-[var(--rule)]" : ""
          }`}
        >
          <div className="max-w-[860px] mx-auto">
            <div className="flex items-center gap-3.5 mb-3.5">
              <span className="block w-7 h-px bg-heritage" />
              <span className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep">
                {cat.eyebrow}
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.4px] leading-[1.1] text-ink mb-8">
              {cat.title}
            </h2>
            <FaqAccordion items={cat.items} />
          </div>
        </section>
      ))}

      {/* CLOSING CTA */}
      <section className="bg-hero text-hero-foreground px-6 sm:px-14 py-24">
        <div className="max-w-[860px] mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] mb-5">
            Still have a question?
          </h2>
          <p className="text-lg text-hero-foreground/70 leading-relaxed max-w-[520px] mx-auto mb-10">
            We reply the same business day. Or pick your side and see the
            platform for yourself.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/for-dental-groups"
              className="inline-flex items-center gap-2 bg-hero-foreground text-hero font-bold text-[15px] px-6 py-3.5 rounded-md hover:opacity-90 transition-opacity"
            >
              I&apos;m a dental group
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
            <Link
              href="/for-candidates"
              className="inline-flex items-center gap-2 border border-hero-foreground/30 text-hero-foreground font-bold text-[15px] px-6 py-3.5 rounded-md hover:bg-hero-foreground/10 transition-colors"
            >
              I&apos;m a dental professional
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
          <p className="text-sm text-hero-foreground/50 mt-8">
            Prefer email? Reach us at{" "}
            <a
              href="mailto:support@dsohire.com"
              className="text-hero-foreground/80 underline underline-offset-2 hover:text-hero-foreground"
            >
              support@dsohire.com
            </a>
            .
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
