"use client";

export default function PrintButton() {
  return (
    <button type="button" className="dbtn dbtn-green dbtn-sm" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
