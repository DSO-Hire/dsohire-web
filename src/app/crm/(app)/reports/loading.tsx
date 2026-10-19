/* Reports skeleton: KPI tiles plus chart-shaped bars. */
const WIDTHS = ["92%", "74%", "61%", "48%", "33%"];

export default function ReportsLoading() {
  return (
    <div className="ws-skel" aria-busy="true">
      <span className="ws-sr" role="status" aria-live="polite">
        Loading reports
      </span>
      <div>
        <span className="ws-skel-line h1" style={{ width: 160 }} />
      </div>
      <div className="kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="kpi" key={i}>
            <span className="ws-skel-line" style={{ width: "45%" }} />
            <span className="ws-skel-line kv" />
            <span className="ws-skel-line" style={{ width: "65%" }} />
          </div>
        ))}
      </div>
      <div className="grid2" aria-hidden="true">
        {[0, 1].map((col) => (
          <div key={col}>
            {[0, 1].map((i) => (
              <div className="ws-skel-card" key={i}>
                <span className="ws-skel-line" style={{ width: "30%" }} />
                <div className="ws-skel-bars">
                  {WIDTHS.map((w, j) => (
                    <span key={j} className="ws-skel-line" style={{ width: w, height: 14 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
