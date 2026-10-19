import Link from "next/link";
import { photoClass, photoStyle } from "../avatars";
import { PLAN_LABELS } from "../format";
import { initials } from "../opportunities/_lib/labels";

export type PipelineParams = {
  view: string;
  owner: string;
  group: string;
  plan: string;
  stale: string;
  lost: string;
};

/** A pipeline URL that keeps every current param except the ones given. */
export function pipelineHref(cur: PipelineParams, patch: Partial<PipelineParams>, path = "/crm/pipeline"): string {
  const next = { ...cur, ...patch };
  const p = new URLSearchParams();
  // A view the caller picks is always explicit, so the switcher's Board link
  // overrides a remembered Table or Compact view instead of bouncing back to it.
  if (next.view && (patch.view || next.view !== "board")) p.set("view", next.view);
  if (next.owner && next.owner !== "all") p.set("owner", next.owner);
  if (next.group && next.group !== "all") p.set("group", next.group);
  if (next.plan && next.plan !== "all") p.set("plan", next.plan);
  if (next.stale === "1") p.set("stale", "1");
  if (next.lost === "1") p.set("lost", "1");
  const q = p.toString();
  return `${path}${q ? `?${q}` : ""}`;
}

function Chip({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`fchip2${on ? " on" : ""}`} aria-current={on ? "true" : undefined} scroll={false}>
      {children}
    </Link>
  );
}

export default function FilterBar({
  params,
  admins,
}: {
  params: PipelineParams;
  admins: { id: string; email: string | null; full_name: string | null }[];
}) {
  const groups: [string, string][] = [
    ["all", "All"],
    ["early", "Early"],
    ["active", "In conversation"],
    ["late", "Proposal out"],
    ["won", "Won"],
  ];
  const plans: [string, string][] = [
    ["all", "All"],
    ...Object.entries(PLAN_LABELS),
    ["none", "Not set"],
  ];
  const anyOn =
    params.owner !== "all" || params.group !== "all" || params.plan !== "all" || params.stale === "1" || params.lost === "1";
  return (
    <nav className="dx-filterbar" aria-label="Pipeline filters">
      <div className="dx-fgroup">
        <span className="dx-flab">OWNER</span>
        <Chip href={pipelineHref(params, { owner: "all" })} on={params.owner === "all"}>
          All
        </Chip>
        <Chip href={pipelineHref(params, { owner: "me" })} on={params.owner === "me"}>
          Mine
        </Chip>
        {admins.length > 1
          ? admins.map((a) => (
              <Chip key={a.id} href={pipelineHref(params, { owner: a.id })} on={params.owner === a.id}>
                <span className={`ownchip${photoClass(a)}`} style={photoStyle(a)} title={a.email ?? ""}>
                  {initials(a)}
                </span>
              </Chip>
            ))
          : null}
      </div>
      <div className="dx-fgroup">
        <span className="dx-flab">STAGE</span>
        {groups.map(([k, l]) => (
          <Chip key={k} href={pipelineHref(params, { group: k })} on={params.group === k}>
            {l}
          </Chip>
        ))}
      </div>
      <div className="dx-fgroup">
        <span className="dx-flab">PLAN</span>
        {plans.map(([k, l]) => (
          <Chip key={k} href={pipelineHref(params, { plan: k })} on={params.plan === k}>
            {l}
          </Chip>
        ))}
      </div>
      <div className="dx-fgroup">
        <Chip href={pipelineHref(params, { stale: params.stale === "1" ? "" : "1" })} on={params.stale === "1"}>
          Stalled only
        </Chip>
        <Chip href={pipelineHref(params, { lost: params.lost === "1" ? "" : "1" })} on={params.lost === "1"}>
          Show lost
        </Chip>
        {anyOn ? (
          <Link
            className="dx-clear"
            href={pipelineHref(params, { owner: "all", group: "all", plan: "all", stale: "", lost: "" })}
            scroll={false}
          >
            Clear
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
