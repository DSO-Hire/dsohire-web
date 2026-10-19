import "../opportunities.css";

/* Skeleton shaped like the opportunity record: header, flow bar, econ
   strip, date rail, then the two-column body. */
export default function OpportunityLoading() {
  return (
    <div className="dx-page" aria-busy="true" aria-label="Loading opportunity">
      <div className="dx-skel" style={{ height: 34, width: 280, marginBottom: 16 }} />
      <div className="dx-skel" style={{ height: 76, marginBottom: 16 }} />
      <div className="econ dx-econ6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="dx-skel" style={{ height: 82 }} />
        ))}
      </div>
      <div className="dx-skel" style={{ height: 58, margin: "10px 0 16px" }} />
      <div className="dgrid">
        <div>
          <div className="dx-skel" style={{ height: 260 }} />
          <div className="dx-skel" style={{ height: 180 }} />
        </div>
        <div>
          <div className="dx-skel" style={{ height: 120 }} />
          <div className="dx-skel" style={{ height: 200 }} />
        </div>
      </div>
    </div>
  );
}
