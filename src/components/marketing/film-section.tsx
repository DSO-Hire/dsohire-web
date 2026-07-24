import { Eyebrow } from "@/components/brand/eyebrow";

/**
 * FilmSection — self-hosted brand film embed for the audience landing pages.
 * Native <video> (no external player), poster frame, metadata-only preload so
 * the page stays fast. Square corners + hairline border per product brand.
 * Vertical (9:16) films render centered at phone width; 16:9 fills the column.
 */
export function FilmSection({
  eyebrow,
  headline,
  sub,
  src,
  poster,
  vertical = false,
}: {
  eyebrow: string;
  headline: string;
  sub: string;
  src: string;
  poster: string;
  vertical?: boolean;
}) {
  return (
    <section className="bg-card border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div className="max-w-[640px] mb-10">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mt-4 mb-4">
            {headline}
          </h2>
          <p className="text-base text-slate-body leading-[1.7]">{sub}</p>
        </div>
        <div className={vertical ? "flex justify-center" : ""}>
          <video
            src={src}
            poster={poster}
            controls
            playsInline
            preload="metadata"
            className={
              vertical
                ? "w-full max-w-[400px] border border-[var(--rule)] bg-ink"
                : "w-full max-w-[960px] border border-[var(--rule)] bg-ink"
            }
          />
        </div>
      </div>
    </section>
  );
}
