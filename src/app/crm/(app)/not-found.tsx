import Link from "next/link";
import PaletteButton from "./_workspace/PaletteButton";

/* Renders inside the CRM shell for notFound() calls (a deleted account or
   opportunity) and for any unmatched /crm/* address. */
export default function CrmNotFound() {
  return (
    <div className="dcardx ws-oops">
      <h1>Nothing lives at this address</h1>
      <p>The record may have been deleted, or the link is off by a character. Search for it instead.</p>
      <div className="row">
        <PaletteButton mode="search" label="Search the CRM" className="dbtn dbtn-green" />
        <Link className="dbtn dbtn-line" href="/crm">
          Today
        </Link>
        <Link className="dbtn dbtn-line" href="/crm/pipeline">
          Pipeline
        </Link>
      </div>
    </div>
  );
}
