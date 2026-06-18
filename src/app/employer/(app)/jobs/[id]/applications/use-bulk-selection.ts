/**
 * useBulkSelection — multi-select primitive for kanban cards.
 *
 * Day 5 of Phase 5A. Pure UI hook with no Supabase coupling so the bulk-actions
 * sprint feature (#3) can layer mutations on top without rewriting state.
 *
 * Behavior:
 *  - `toggle(id)`: single-card add/remove from the selection set.
 *  - `shiftClick(id, allIdsInOrder)`: range select. Tracks `lastClicked`; on
 *    shift-click, selects every id between `lastClicked` and `id` in
 *    `allIdsInOrder` (inclusive). If no `lastClicked` (or it's not present in
 *    `allIdsInOrder`), behaves like a normal toggle and seeds `lastClicked`.
 *  - `clear()`: empties the set + resets `lastClicked`.
 *  - `selectAll(ids)`: replaces the set with the provided ids.
 *
 * `allIdsInOrder` is supplied by the caller (the column or board) so the hook
 * stays decoupled from layout — column order, render order, etc. are decided
 * upstream. The order should match the visual top-to-bottom traversal that
 * makes sense for shift-range select (typically column-major: column-by-column,
 * top-to-bottom within each).
 */

"use client";

import { useCallback, useRef, useState } from "react";

export interface UseBulkSelectionResult {
  selected: ReadonlySet<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: (ids: Iterable<string>) => void;
  shiftClick: (id: string, allIdsInOrder: readonly string[]) => void;
  count: number;
}

export function useBulkSelection(): UseBulkSelectionResult {
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const lastClickedRef = useRef<string | null>(null);

  const isSelected = useCallback(
    (id: string) => selected.has(id),
    [selected]
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClickedRef.current = id;
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set<string>());
    lastClickedRef.current = null;
  }, []);

  const selectAll = useCallback((ids: Iterable<string>) => {
    setSelected(new Set(ids));
  }, []);

  const shiftClick = useCallback(
    (id: string, allIdsInOrder: readonly string[]) => {
      const last = lastClickedRef.current;
      const currentIdx = allIdsInOrder.indexOf(id);
      const lastIdx = last !== null ? allIdsInOrder.indexOf(last) : -1;

      if (last === null || lastIdx === -1 || currentIdx === -1) {
        // Fallback: behaves like toggle and seeds the anchor.
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        lastClickedRef.current = id;
        return;
      }

      const [from, to] =
        lastIdx <= currentIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx];
      const range = allIdsInOrder.slice(from, to + 1);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const rId of range) next.add(rId);
        return next;
      });
      // Don't update lastClicked on shift-click — sticky anchor matches the
      // common spreadsheet convention (Cmd/Ctrl-click resets, shift extends).
    },
    []
  );

  return {
    selected,
    isSelected,
    toggle,
    clear,
    selectAll,
    shiftClick,
    count: selected.size,
  };
}
