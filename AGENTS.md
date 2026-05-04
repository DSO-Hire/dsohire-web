<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Applications kanban (`/employer/jobs/[id]/applications`)

The per-job applications surface is the working pipeline. Architecture spans `src/lib/applications/stages.ts` (constants) plus six files under `src/app/employer/jobs/[id]/applications/`.

**Stages.** `STAGE_LABELS` in `src/lib/applications/stages.ts` is the single source of truth for human-readable status copy on every employer-facing surface (kanban columns, cross-job inbox, application detail, status-history timeline, dashboard widget). The candidate-facing dashboards intentionally use different audience-specific copy (`Submitted` / `Not selected`) and keep their own local label maps. To add a new stage, update the `application_status` Postgres enum, regenerate `database.types.ts`, then extend `KANBAN_STAGES` (open lane) or `CLOSED_STAGES` (closed lane) plus `STAGE_LABELS` and `STAGE_COLORS`. The matrix is exhaustive over the enum, so TypeScript catches missing entries.

**Heat indicator.** `daysInStage()` + `stageHeatLevel()` + `STAGE_HEAT_CLASSES` produce the cool/warm/hot pill used identically by `kanban-card.tsx` and `mobile-stage-tabs.tsx`. Hot rows pulse to draw the eye to stale candidates. Don't fork the class map — extend `STAGE_HEAT_CLASSES`.

**Realtime self-echo dedupe.** `pendingMovesRef` (Map of `applicationId -> expectedStatus`) is owned by `kanban-board.tsx`, written on drag-drop, and cleared in two places: by `use-realtime-applications.ts` when the matching echo arrives (success path), and by the board itself in the failure branch. Single-owner-per-outcome — never clear from both sides or you'll get phantom "teammate moved" toasts on your own moves. The pattern is reusable for any optimistic UI that also subscribes to a postgres_changes feed.

**Optimistic update.** `useOptimistic` layers in-flight moves over the realtime hook's committed truth. Server confirmation calls `commitLocal()` to advance base state without waiting for the echo. Rollback happens implicitly: if the action fails, the optimistic value drops on the next render and the old base state shows through. `runMove()` in `kanban-board.tsx` is the extracted retry-friendly wrapper — call it for any single-card move, including from a Retry button on a network-fail banner.

**Error UX.** Errors split into `kind: "network"` (offers Retry, re-runs `runMove` with the same args) and `kind: "denied"` (RLS or row-not-found, dismiss only). The board distinguishes by catching thrown errors as network and treating typed `{ ok: false }` server returns as denied. A `beforeunload` listener fires only while a drag is in-flight or pending — it warns the user before they lose work, and detaches the moment the queue empties. An `isMountedRef` gates state writes inside the async transition so a slow response after navigation doesn't leak.

**dnd-kit conventions.** PointerSensor (5px activation distance) + KeyboardSensor with default coordinate getter, which walks droppables in DOM order and matches our left-to-right column layout. Custom `Announcements` reads candidate name + stage label aloud rather than dnd-kit's generic defaults. DragOverlay is the visible drag artifact; the in-place card dims to 30% opacity. Drop animation is a 150ms ease-out so cards land softly. Withdrawn rows are intentionally not draggable and not selectable — withdraw is a candidate-side action.

**Bulk selection.** `use-bulk-selection.ts` is a pure UI primitive with no Supabase coupling. `selected: ReadonlySet<string>` plus `toggle()` / `shiftClick()` / `clear()`. The board owns the column-major id-order array passed to `shiftClick()` so range-select traverses the visual layout. Bulk-action mutations layer on top without touching the hook.
