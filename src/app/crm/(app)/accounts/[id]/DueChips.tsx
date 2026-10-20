"use client";

/**
 * Cadence chips beside the log-touch form's due date (ported from the July
 * single-file CRM): one click sets next_step_due to today + N days.
 */
const CADENCE = [3, 7, 14, 30];

export default function DueChips({ today }: { today: string }) {
  function pick(e: React.MouseEvent<HTMLButtonElement>, days: number) {
    const input = e.currentTarget.form?.elements.namedItem("next_step_due");
    if (!(input instanceof HTMLInputElement)) return;
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    input.value = d.toISOString().slice(0, 10);
  }
  return (
    <span className="sl-chips" style={{ margin: 0 }} aria-label="Set next step due date">
      {CADENCE.map((n) => (
        <button key={n} type="button" className="fchip2" onClick={(e) => pick(e, n)}>
          +{n}d
        </button>
      ))}
    </span>
  );
}
