/**
 * Candidate-profile loading state — #91 P0-B. Back-link → identity block
 * (avatar + name + chips) → two-column profile body.
 */

export default function Loading() {
  return (
    <div className="min-w-0">
      <span className="sk block h-3 w-28 mb-6" />
      <div className="flex items-start gap-5 mb-8 max-w-[820px]">
        <span className="sk h-16 w-16 rounded-full shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="sk block h-7 w-[45%]" />
          <span className="sk block h-3 w-[65%] mt-3" />
          <div className="mt-3 flex gap-2">
            <span className="sk h-5 w-24" />
            <span className="sk h-5 w-20" />
            <span className="sk h-5 w-28" />
          </div>
        </div>
        <span className="sk h-10 w-32 shrink-0" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 items-start">
        <div className="border border-[var(--rule)] bg-card p-6">
          <span className="sk block h-3 w-32" />
          <span className="sk block h-4 w-[85%] mt-4" />
          <span className="sk block h-4 w-[75%] mt-3" />
          <span className="sk block h-4 w-[80%] mt-3" />
          <span className="sk block h-4 w-[60%] mt-3" />
        </div>
        <div className="border border-[var(--rule)] bg-card p-6">
          <span className="sk block h-3 w-24" />
          <span className="sk block h-16 w-16 mt-4 mx-auto rounded-full" />
          <span className="sk block h-3 w-[70%] mt-4 mx-auto" />
        </div>
      </div>
    </div>
  );
}
