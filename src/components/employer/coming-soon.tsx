/**
 * ComingSoon — placeholder for /employer/* routes wired into the sidebar
 * but not yet implemented. Each calling page sets the title + roadmap phase.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface ComingSoonProps {
  title: string;
  blurb: string;
  phase: string;
}

export function ComingSoon({ title, blurb, phase }: ComingSoonProps) {
  return (
    <div className="max-w-[760px]">
      <Link
        href="/employer/dashboard"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Dashboard
      </Link>

      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3">
        {phase}
      </div>
      <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink mb-5">
        {title}
      </h1>
      <p className="text-base text-slate-body leading-[1.7] mb-10">{blurb}</p>

      <div className="bg-cream border-l-4 border-heritage p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          On the Roadmap
        </div>
        <p className="text-[14px] text-ink leading-relaxed">
          This area of the dashboard ships in {phase} of the build sprint. Until
          then, the sidebar link gets you here. If you have feedback on what
          you&apos;d want to see when this lands, email{" "}
          <a
            href="mailto:cam@dsohire.com"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
          >
            cam@dsohire.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
