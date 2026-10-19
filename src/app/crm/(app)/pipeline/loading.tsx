import "../opportunities/opportunities.css";
import "./pipeline.css";

/* Skeleton shaped like the pipeline: filter chips, four totals, columns. */
export default function PipelineLoading() {
  return (
    <div className="dx-page" aria-busy="true" aria-label="Loading pipeline">
      <div className="dx-skel" style={{ height: 34, width: 220, marginBottom: 16 }} />
      <div className="dx-skel" style={{ height: 30, marginBottom: 14 }} />
      <div className="kpis">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="dx-skel" style={{ height: 96 }} />
        ))}
      </div>
      <div className="board">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="dx-skel" style={{ height: 340 }} />
        ))}
      </div>
    </div>
  );
}
