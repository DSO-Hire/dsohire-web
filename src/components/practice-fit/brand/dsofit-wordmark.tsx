/**
 * DSOFit wordmark — the heritage-green sibling of the navy PracticeFit
 * wordmark. PracticeFit = navy (practice-level); DSOFit = heritage green
 * (DSO / corporate). v1 is text-based two-tone; a custom mark can come with the
 * full brand pass (#56).
 */

export function DsoFitWordmark({
  tm = false,
  className = "text-2xl",
}: {
  /** Show ™ on first use. */
  tm?: boolean;
  /** Size via a text-* class. */
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline font-extrabold tracking-tight ${className}`}>
      <span className="text-heritage-deep">DSO</span>
      <span className="text-ink">Fit</span>
      {tm && <span className="ml-0.5 align-super text-[0.5em] font-semibold text-slate-meta">™</span>}
    </span>
  );
}
