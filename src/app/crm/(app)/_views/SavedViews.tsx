import Link from "next/link";
import { crmPageGate } from "@/lib/crm/auth";
import { MAX_VIEWS_PER_SURFACE, normalizeViewQuery, surfacePath, type ViewSurface } from "./query";
import { SaveViewForm, ViewChipTools } from "./ViewsClient";
import "./views.css";

/* "My views": the signed-in founder's saved filter sets for one list,
   as chips linking to ?<query>. The chip whose query matches the current
   URL (volatile params ignored) is highlighted. Server component: reads
   crm_saved_views through the request's CRM session (own-row RLS). */
export default async function SavedViews({
  surface,
  current,
  label = "MY VIEWS",
}: {
  surface: ViewSurface;
  /** The page's current search params (raw), or a querystring. */
  current: string | Record<string, string | string[] | undefined>;
  label?: string;
}) {
  const gate = await crmPageGate(surfacePath(surface));
  if (typeof gate === "string") return null;
  const { data, error } = await gate.supabase
    .from("crm_saved_views")
    .select("id, name, query, sort")
    .eq("owner_id", gate.me)
    .eq("surface", surface)
    .order("sort")
    .order("created_at");
  const views = (data ?? []) as { id: string; name: string; query: string; sort: number }[];
  const cur = normalizeViewQuery(current);
  const activeId = cur ? views.find((v) => normalizeViewQuery(v.query) === cur)?.id ?? null : null;
  const base = surfacePath(surface);

  return (
    <div className="sv-bar" aria-label="Saved views">
      <span className="sv-l">{label}</span>
      {error ? <span className="sv-note">Saved views did not load.</span> : null}
      {views.length === 0 && !error ? <span className="sv-note">None yet. Filter the list, then save it.</span> : null}
      {views.map((v, i) => {
        const on = v.id === activeId;
        return (
          <span key={v.id} className={`sv-chip${on ? " on" : ""}`}>
            <Link
              className="sv-go"
              href={v.query ? `${base}?${v.query}` : base}
              aria-current={on ? "true" : undefined}
              scroll={false}
            >
              {v.name}
            </Link>
            <ViewChipTools id={v.id} name={v.name} first={i === 0} last={i === views.length - 1} />
          </span>
        );
      })}
      {!activeId && cur ? <SaveViewForm surface={surface} query={cur} full={views.length >= MAX_VIEWS_PER_SURFACE} /> : null}
    </div>
  );
}
