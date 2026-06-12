/**
 * Dashboard greeting — Lane 2 follow-up (Cam, Day 32 night):
 * "smart and reactive… makes it feel alive."
 *
 * Picks the most newsworthy TRUE fact from data the dashboard already
 * loaded (zero new queries) and leads with it. Honesty rules carried
 * over from Lane 2c: no fake time-of-day (server renders UTC), no
 * invented numbers — every line is backed by the same counts the KPI
 * tiles show. A day-seeded pick between equivalent phrasings keeps
 * repeat states from reading identically two days running.
 */

export interface GreetingInput {
  firstName: string;
  /** Applications currently awaiting first review. */
  awaitingReview: number;
  /** True when any awaiting-review app is past the first-response SLA. */
  slaBreached: boolean;
  appsThisWeek: number;
  /** Hires in the trailing 7 days (sum of the spark buckets). */
  hiresThisWeek: number;
  /** Offers sent and still unanswered (60d window). */
  offersOut: number;
  /** Mid-pipeline candidates stalling (stuck + stale totals). */
  stalledCount: number;
  /** Stable per-day seed (e.g. day of year) for phrasing rotation. */
  daySeed: number;
}

function pick(seed: number, options: string[]): string {
  return options[seed % options.length];
}

export function buildGreeting(g: GreetingInput): string {
  const n = g.firstName;
  const s = g.daySeed;

  // 1 · A hire this week — always the best news in hiring.
  if (g.hiresThisWeek > 0) {
    return pick(s, [
      `${g.hiresThisWeek === 1 ? "A hire" : `${g.hiresThisWeek} hires`} this week, ${n} — that's the whole point.`,
      `You hired this week, ${n}. Keep the line moving.`,
    ]);
  }

  // 2 · SLA breach — the most urgent true fact.
  if (g.slaBreached && g.awaitingReview > 0) {
    return pick(s, [
      `${g.awaitingReview === 1 ? "A candidate is" : "Candidates are"} waiting past your response goal, ${n}.`,
      `First responses are running late, ${n} — the queue below clears them.`,
    ]);
  }

  // 3 · Offers out — answers pending.
  if (g.offersOut > 0) {
    return pick(s, [
      `${g.offersOut === 1 ? "An offer is" : `${g.offersOut} offers are`} out, ${n} — answers incoming.`,
      `Ink is drying on ${g.offersOut === 1 ? "an offer" : `${g.offersOut} offers`}, ${n}.`,
    ]);
  }

  // 4 · Busy application week.
  if (g.appsThisWeek >= 5) {
    return pick(s, [
      `${g.appsThisWeek} new candidates this week, ${n} — the funnel's working.`,
      `A busy week: ${g.appsThisWeek} applications and counting, ${n}.`,
    ]);
  }

  // 5 · Stalls are the story.
  if (g.stalledCount > 0) {
    return pick(s, [
      `${g.stalledCount === 1 ? "One candidate is" : `${g.stalledCount} candidates are`} stalling mid-pipeline, ${n} — today's queue unsticks them.`,
      `A few candidacies need a nudge, ${n}. Start at the top.`,
    ]);
  }

  // 6 · Genuinely caught up.
  if (g.awaitingReview === 0) {
    return pick(s, [
      `All caught up, ${n}. Here's what keeps hiring moving.`,
      `Clean slate today, ${n} — a good day to post or source.`,
    ]);
  }

  // 7 · Default — the original line.
  return `Here's what moves hiring forward today, ${n}.`;
}
