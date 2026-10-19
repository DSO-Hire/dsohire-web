/* Skeleton while a CRM page loads: header bar, four KPI tiles, and a
   two-column grid of cards. The shimmer stops under reduced motion. */
export default function Loading() {
  return (
    <div className="ws-skel" aria-busy="true">
      <span className="ws-sr" role="status" aria-live="polite">
        Loading
      </span>
      <div>
        <span className="ws-skel-line h1" />
        <span className="ws-skel-line" style={{ width: 220, marginTop: 10 }} />
      </div>
      <div className="kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <span className="ws-skel-line" style={{ width: "40%" }} />
            <span className="ws-skel-line kv" />
            <span className="ws-skel-line" style={{ width: "70%" }} />
          </div>
        ))}
      </div>
      <div className="grid2" aria-hidden="true">
        {[0, 1].map((col) => (
          <div key={col}>
            {[0, 1, 2].map((i) => (
              <div className="ws-skel-card" key={i}>
                <span className="ws-skel-line" style={{ width: "35%" }} />
                <span className="ws-skel-line" />
                <span className="ws-skel-line" style={{ width: "85%" }} />
                <span className="ws-skel-line" style={{ width: "60%" }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
