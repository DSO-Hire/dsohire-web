import type { Health } from "../../_lib/health";

/* Ported from the EDC deal health card, plus the three signals a founder
   checks first on a SaaS opportunity: days in stage, days since the last
   touch on the account, and whether the next step is overdue. */
export default function HealthCard({
  health,
  daysInStage,
  touchDays,
  nextStepOverdue,
}: {
  health: Health | null;
  daysInStage: number;
  touchDays: number | null;
  nextStepOverdue: number | null;
}) {
  if (!health) return null;
  return (
    <div className="dcardx" id="dx-health">
      <div className="ch">
        <h3>Opportunity health</h3>
        <span className={`pill ${health.level}`}>{health.label}</span>
      </div>
      <div className="kvrow">
        <span className="k2">Days in stage</span>
        <span className="v2 num">{daysInStage}</span>
      </div>
      <div className="kvrow">
        <span className="k2">Since last touch</span>
        <span className="v2 num">{touchDays === null ? "never touched" : touchDays === 0 ? "today" : `${touchDays}d`}</span>
      </div>
      <div className="kvrow">
        <span className="k2">Next step</span>
        <span className="v2 num">
          {nextStepOverdue === null ? "on time" : nextStepOverdue === 0 ? "due today" : `${nextStepOverdue}d overdue`}
        </span>
      </div>
      {health.reasons.length === 0 ? (
        <div className="empty-note">Nothing flagged.</div>
      ) : (
        <ul className="dx-reasons">
          {health.reasons.map((r, i) => (
            <li key={i}>
              <span className={`dx-dot ${r.tone}`} aria-hidden="true" />
              <a href={r.anchor}>{r.text}</a>
              <span className="ws-sr">{r.tone === "crit" ? "(needs action)" : "(watch)"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
