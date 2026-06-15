/**
 * Tool: build_deep_link  (Lane 8 Assistant 2.0 — Commit 3, closes #82)
 *
 * Returns a ONE-CLICK in-app navigation button instead of a written click
 * path. Read-only: it only constructs an INTERNAL href from a fixed
 * allowlist of route templates — never from raw model input — so there is
 * no open-redirect or arbitrary-navigation surface. The destination page
 * enforces its own auth/RLS; this tool just hands the user a link.
 *
 * The route extracts successful results from the tool buffer and streams
 * them as `links` SSE events; the drawer renders "Open … ↗" buttons.
 */

import type { ToolHandler } from "./types";

type Scope = "employer" | "candidate";

interface RouteDef {
  scope: Scope;
  needsId?: boolean;
  path: (id?: string) => string;
  label: string;
}

const ROUTES: Record<string, RouteDef> = {
  // ── Employer ──
  dashboard: { scope: "employer", path: () => "/employer/dashboard", label: "Open your dashboard" },
  applications: { scope: "employer", path: () => "/employer/applications", label: "Open all applications" },
  application: { scope: "employer", needsId: true, path: (id) => `/employer/applications/${id}`, label: "Open this application" },
  application_messages: { scope: "employer", needsId: true, path: (id) => `/employer/applications/${id}#messages`, label: "Open the messages" },
  application_scorecards: { scope: "employer", needsId: true, path: (id) => `/employer/applications/${id}#scorecards`, label: "Open the scorecards" },
  application_screening: { scope: "employer", needsId: true, path: (id) => `/employer/applications/${id}#screening`, label: "Open the screening answers" },
  application_offer: { scope: "employer", needsId: true, path: (id) => `/employer/applications/${id}#offer`, label: "Open the offer" },
  job: { scope: "employer", needsId: true, path: (id) => `/employer/jobs/${id}`, label: "Open this job" },
  job_pipeline: { scope: "employer", needsId: true, path: (id) => `/employer/jobs/${id}/applications`, label: "Open the pipeline board" },
  jobs: { scope: "employer", path: () => "/employer/jobs", label: "Open your jobs" },
  new_job: { scope: "employer", path: () => "/employer/jobs/new", label: "Post a new job" },
  inbox: { scope: "employer", path: () => "/employer/inbox", label: "Open your inbox" },
  talent_pool: { scope: "employer", path: () => "/employer/talent-pool", label: "Open the talent pool" },
  analytics: { scope: "employer", path: () => "/employer/analytics", label: "Open analytics" },
  automations: { scope: "employer", path: () => "/employer/automations", label: "Open automations" },
  team: { scope: "employer", path: () => "/employer/team", label: "Open your team" },
  billing: { scope: "employer", path: () => "/employer/billing", label: "Open billing" },
  offer_approvals: { scope: "employer", path: () => "/employer/offer-approvals", label: "Open offer approvals" },
  settings: { scope: "employer", path: () => "/employer/settings", label: "Open settings" },
  settings_pipeline: { scope: "employer", path: () => "/employer/settings/pipeline", label: "Open pipeline settings" },
  settings_templates: { scope: "employer", path: () => "/employer/settings/templates", label: "Open email templates" },
  locations: { scope: "employer", path: () => "/employer/locations", label: "Open locations" },
  locations_bulk: { scope: "employer", path: () => "/employer/locations/bulk", label: "Bulk add locations" },
  // ── Candidate ──
  candidate_dashboard: { scope: "candidate", path: () => "/candidate/dashboard", label: "Open your dashboard" },
  candidate_applications: { scope: "candidate", path: () => "/candidate/applications", label: "Open your applications" },
  candidate_application: { scope: "candidate", needsId: true, path: (id) => `/candidate/applications/${id}`, label: "Open this application" },
  candidate_saved: { scope: "candidate", path: () => "/candidate/applications/saved", label: "Open saved jobs" },
  candidate_jobs: { scope: "candidate", path: () => "/candidate/jobs", label: "Browse jobs" },
  candidate_assessment: { scope: "candidate", path: () => "/candidate/assessment", label: "Open your PracticeFit assessment" },
  candidate_practice_fit: { scope: "candidate", path: () => "/candidate/practice-fit", label: "Open your PracticeFit hub" },
  candidate_dsofit: { scope: "candidate", path: () => "/candidate/dsofit", label: "Open your DSOFit hub" },
  candidate_resume: { scope: "candidate", path: () => "/candidate/resume", label: "Open your résumé" },
  candidate_resume_build: { scope: "candidate", path: () => "/candidate/resume/build", label: "Open the résumé builder" },
  candidate_profile: { scope: "candidate", path: () => "/candidate/profile", label: "Open your profile" },
  candidate_inbox: { scope: "candidate", path: () => "/candidate/inbox", label: "Open your inbox" },
  candidate_settings: { scope: "candidate", path: () => "/candidate/settings", label: "Open settings" },
  candidate_privacy: { scope: "candidate", path: () => "/candidate/settings/privacy", label: "Open privacy settings" },
  candidate_credentials: { scope: "candidate", path: () => "/candidate/settings/credentials", label: "Open credentials" },
};

const UUID_RE = /^[0-9a-fA-F-]{16,}$/;

export const buildDeepLink: ToolHandler = {
  schema: {
    name: "build_deep_link",
    description:
      "Return a one-click in-app navigation button instead of describing a click path. Call this whenever there's a relevant DSO Hire destination for the user's question — prefer it over 'go to Settings → …' step lists. Pass `target` (a destination key) and, for record-specific destinations, `id` (use the focused entity's id from the User context block). Optionally pass a short `label`. Employer targets: dashboard, applications, application[id], application_messages[id], application_scorecards[id], application_screening[id], application_offer[id], job[id], job_pipeline[id], jobs, new_job, inbox, talent_pool, analytics, automations, team, billing, offer_approvals, settings, settings_pipeline, settings_templates, locations, locations_bulk. Candidate targets: candidate_dashboard, candidate_applications, candidate_application[id], candidate_saved, candidate_jobs, candidate_assessment, candidate_practice_fit, candidate_dsofit, candidate_resume, candidate_resume_build, candidate_profile, candidate_inbox, candidate_settings, candidate_privacy, candidate_credentials.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Destination key from the lists in the tool description.",
        },
        id: {
          type: "string",
          description: "UUID for record-specific destinations (the [id] targets).",
        },
        label: {
          type: "string",
          description: "Optional short button label, e.g. \"Open Sarah's messages\".",
        },
      },
      required: ["target"],
    },
  },
  async run(input, ctx) {
    const target = String(input.target ?? "").trim();
    const def = ROUTES[target];
    if (!def) return { error: `Unknown deep-link target: ${target}` };

    const scope: Scope = ctx.dsoId ? "employer" : "candidate";
    if (def.scope !== scope) {
      return { error: `Target ${target} isn't available for this user.` };
    }

    let id: string | undefined;
    if (def.needsId) {
      id = String(input.id ?? "").trim();
      if (!UUID_RE.test(id)) {
        return { error: `Target ${target} needs a valid record id.` };
      }
    }

    const href = def.path(id);
    const rawLabel = typeof input.label === "string" ? input.label : "";
    const label =
      rawLabel.replace(/[\r\n]+/g, " ").trim().slice(0, 60) || def.label;

    return { ok: true, href, label };
  },
};
