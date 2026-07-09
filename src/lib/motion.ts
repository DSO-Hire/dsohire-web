/**
 * Motion constants for JS-driven animation (WAAPI `element.animate`,
 * rAF-computed easings) — the ONE place these APIs, which can't read CSS
 * custom properties, get the house curves.
 *
 * These MIRROR the CSS motion tokens in globals.css (--ease-settle,
 * --duration-*). If you change a value, change it in both files.
 *
 * The personality: precise, settling, architectural. Small distances,
 * ~120–420ms, no scroll-jacking. Reduced-motion gating is the CALLER's
 * job on every JS-driven path (matchMedia("(prefers-reduced-motion: reduce)")).
 */

/** The brand curve — D-mark draw-on, kanban landings, showcase choreography. */
export const EASE_SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Secondary out-curve for exits/fades that shouldn't overshoot-feel. */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

export const DURATION_FAST = 120; // hover feedback, chip state flips
export const DURATION_BASE = 240; // most transitions
export const DURATION_SLOW = 420; // page-level moves, large surfaces
