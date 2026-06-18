"use client";

/**
 * <PipelineEditor> — client orchestrator for /employer/settings/pipeline
 * (Phase 5A Track B follow-on, 2026-05-12).
 *
 * Responsibilities:
 *   - Render the DSO's pipeline stages in sort_order.
 *   - Drag handle on each row + dnd-kit/sortable to reorder.
 *   - Click label → inline edit (Enter saves, Esc cancels).
 *   - Color swatch click → small popover with the 10 palette options.
 *   - Per-row action menu: Hide/Show, Set default, Delete.
 *   - "Add stage" inline form (kind picker + label input).
 *
 * `canEdit=false` → every mutation control renders disabled. Drag
 * handles are hidden; the "Add stage" button shows an upgrade tooltip.
 * Server-side actions defense-in-depth: every action re-checks
 * tier + role, so a flipped boolean in devtools doesn't actually let
 * Starter mutate.
 *
 * Errors are inline per-row (no toast) so failures stay visually local
 * to the affected stage.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  EyeOff,
  Eye,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Palette,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  KIND_DEFAULT_LABELS,
  MAX_STAGES_PER_DSO,
  STAGE_COLOR_OPTIONS,
  STAGE_COLOR_PALETTE,
  STAGE_KINDS,
  colorTripleFor,
  type PipelineStage,
  type StageColorPaletteName,
  type StageKind,
} from "@/lib/applications/stages";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addStage,
  deleteStage,
  recolorStage,
  renameStage,
  reorderStages,
  setStageDefault,
  setStageHidden,
} from "./actions";

interface PipelineEditorProps {
  initialStages: PipelineStage[];
  canEdit: boolean;
  /** Current Stripe tier slug — kept for future tier-specific UI nudges.
   *  Read-only on the page for now (the canEdit flag already encodes
   *  the unlock decision). */
  tier?: string | null;
}

export function PipelineEditor({
  initialStages,
  canEdit,
}: PipelineEditorProps) {
  const router = useRouter();
  // Canonical base state. Updated after server confirmations succeed.
  const [stages, setStages] = useState<PipelineStage[]>(initialStages);
  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  // Optimistic layer for drag reorder + hide toggle so the row snaps
  // visually before the server confirms.
  const [optStages, applyOpt] = useOptimistic(
    stages,
    (base: PipelineStage[], update: { type: "reorder"; ids: string[] }) => {
      if (update.type === "reorder") {
        const byId = new Map(base.map((s) => [s.id, s]));
        return update.ids
          .map((id, idx) => {
            const row = byId.get(id);
            return row ? { ...row, sort_order: idx * 10 } : null;
          })
          .filter((r): r is PipelineStage => r !== null);
      }
      return base;
    }
  );

  const sortedStages = useMemo(
    () => [...optStages].sort((a, b) => a.sort_order - b.sort_order),
    [optStages]
  );
  const totalCount = stages.length;
  const atCap = totalCount >= MAX_STAGES_PER_DSO;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Global non-row error (e.g., add-stage form failure).
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canEdit) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const currentIds = sortedStages.map((s) => s.id);
      const fromIdx = currentIds.indexOf(String(active.id));
      const toIdx = currentIds.indexOf(String(over.id));
      if (fromIdx < 0 || toIdx < 0) return;
      const nextIds = arrayMove(currentIds, fromIdx, toIdx);

      startTransition(async () => {
        applyOpt({ type: "reorder", ids: nextIds });
        const result = await reorderStages(nextIds);
        if (!result.ok) {
          setGlobalError(result.error);
          // Optimistic value rolls back on the next render.
          return;
        }
        // Commit to base state so future renders don't need the
        // optimistic layer.
        setStages((prev) => {
          const byId = new Map(prev.map((s) => [s.id, s]));
          return nextIds
            .map((id, idx) => {
              const row = byId.get(id);
              return row ? { ...row, sort_order: idx * 10 } : null;
            })
            .filter((r): r is PipelineStage => r !== null);
        });
      });
    },
    [canEdit, sortedStages, applyOpt]
  );

  // Local state mutators used by each row. Encapsulates the "update
  // local state on success" pattern so the row component stays focused
  // on UI.
  const replaceRow = useCallback((next: PipelineStage) => {
    setStages((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  }, []);

  const removeRow = useCallback((id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // For cross-row state changes (add, delete, set default) we rely on
  // router.refresh() to re-fetch the server-rendered list. Simpler than
  // synthesizing optimistic rows whose ids wouldn't match the eventual
  // server-assigned uuid.
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-4">
      {globalError && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" />
            {globalError}
          </span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={sortedStages.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2 border border-[var(--rule)] bg-white">
            {sortedStages.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                canEdit={canEdit}
                allStages={stages}
                onChange={replaceRow}
                onDelete={(id) => {
                  removeRow(id);
                  refresh();
                }}
                onDefaulted={() => refresh()}
              />
            ))}
            {sortedStages.length === 0 && (
              <li className="px-4 py-6 text-sm text-slate-meta">
                No stages yet. (This shouldn&apos;t happen — every DSO
                gets seeded with seven stages at creation. Refresh, then
                contact support if the list stays empty.)
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>

      <AddStageForm
        canEdit={canEdit}
        atCap={atCap}
        onAdded={refresh}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * StageRow
 * ────────────────────────────────────────────────────────── */

interface StageRowProps {
  stage: PipelineStage;
  canEdit: boolean;
  allStages: PipelineStage[];
  onChange: (next: PipelineStage) => void;
  onDelete: (id: string) => void;
  /** Fired after a successful set-as-default so the parent can re-fetch
   *  the canonical list (the sibling row that lost its default flag
   *  also needs to refresh). */
  onDefaulted: () => void;
}

function StageRow({
  stage,
  canEdit,
  allStages,
  onChange,
  onDelete,
  onDefaulted,
}: StageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id, disabled: !canEdit });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(stage.label);
  const [colorOpen, setColorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const colorPopoverRef = useRef<HTMLDivElement | null>(null);

  // Click-outside to close the color popover.
  useEffect(() => {
    if (!colorOpen) return;
    function onDocClick(e: MouseEvent) {
      if (
        colorPopoverRef.current &&
        !colorPopoverRef.current.contains(e.target as Node)
      ) {
        setColorOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [colorOpen]);

  useEffect(() => setLabelDraft(stage.label), [stage.label]);

  useEffect(() => {
    if (editingLabel) inputRef.current?.focus();
  }, [editingLabel]);

  const triple = colorTripleFor(stage.color_class, stage.kind);

  const commitLabel = useCallback(() => {
    setRowError(null);
    const trimmed = labelDraft.trim();
    if (!trimmed) {
      setRowError("Label can't be empty.");
      return;
    }
    if (trimmed.length > 40) {
      setRowError("Label is too long (max 40).");
      return;
    }
    if (trimmed === stage.label) {
      setEditingLabel(false);
      return;
    }
    startTransition(async () => {
      const result = await renameStage(stage.id, trimmed);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      onChange({ ...stage, label: trimmed });
      setEditingLabel(false);
    });
  }, [labelDraft, stage, onChange]);

  const cancelLabel = useCallback(() => {
    setLabelDraft(stage.label);
    setEditingLabel(false);
    setRowError(null);
  }, [stage.label]);

  const recolor = useCallback(
    (color: StageColorPaletteName | null) => {
      setRowError(null);
      setColorOpen(false);
      if (color === stage.color_class) return;
      startTransition(async () => {
        const result = await recolorStage(stage.id, color);
        if (!result.ok) {
          setRowError(result.error);
          return;
        }
        onChange({ ...stage, color_class: color });
      });
    },
    [stage, onChange]
  );

  const toggleHidden = useCallback(() => {
    setRowError(null);
    const next = !stage.is_hidden;
    startTransition(async () => {
      const result = await setStageHidden(stage.id, next);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      onChange({ ...stage, is_hidden: next });
    });
  }, [stage, onChange]);

  const makeDefault = useCallback(() => {
    setRowError(null);
    startTransition(async () => {
      const result = await setStageDefault(stage.id);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      // Local: this row becomes default. Parent's onDefaulted refreshes
      // so the sibling row that lost its default flag also rerenders.
      onChange({ ...stage, is_default: true });
      onDefaulted();
    });
  }, [stage, onChange, onDefaulted]);

  const confirmDelete = useCallback(() => {
    setRowError(null);
    startTransition(async () => {
      const result = await deleteStage(stage.id);
      if (!result.ok) {
        setRowError(result.error);
        setDeleteOpen(false);
        return;
      }
      setDeleteOpen(false);
      onDelete(stage.id);
    });
  }, [stage.id, onDelete]);

  // Can this row be deleted? Mirrors the server check so the menu item
  // gets disabled instead of producing a useless error.
  const siblingsOfSameKind = allStages.filter(
    (s) => s.kind === stage.kind && s.id !== stage.id
  );
  const deletable =
    canEdit && !stage.is_default && siblingsOfSameKind.length > 0;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={
        "flex items-center gap-3 border-b border-[var(--rule)] last:border-b-0 px-3 py-3 " +
        (stage.is_hidden ? "bg-cream/30 opacity-70" : "bg-white")
      }
    >
      {/* Drag handle */}
      {canEdit ? (
        <button
          type="button"
          aria-label={`Drag to reorder ${stage.label}`}
          className="cursor-grab touch-none rounded p-1 text-slate-meta hover:bg-cream/60 hover:text-ink active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="inline-block w-6" aria-hidden />
      )}

      {/* Color swatch */}
      <div className="relative" ref={colorPopoverRef}>
        <button
          type="button"
          aria-label={`Stage color (${stage.color_class ?? "default"})`}
          disabled={!canEdit}
          onClick={() => setColorOpen((v) => !v)}
          className={
            "size-6 rounded ring-1 transition " +
            triple.bg +
            " " +
            triple.ring +
            (canEdit ? " hover:ring-2" : " cursor-not-allowed")
          }
        />
        {colorOpen && canEdit && (
          <div
            className="absolute z-20 top-8 left-0 grid grid-cols-5 gap-1.5 rounded border border-[var(--rule-strong)] bg-white p-2 shadow-lg"
          >
            <button
              type="button"
              onClick={() => recolor(null)}
              title="Reset to default"
              className="col-span-5 mb-1 text-[10px] tracking-[1px] uppercase font-semibold text-slate-meta hover:text-ink text-left"
            >
              Reset to default
            </button>
            {STAGE_COLOR_OPTIONS.map((name) => {
              const palette = STAGE_COLOR_PALETTE[name];
              const isCurrent = name === stage.color_class;
              return (
                <button
                  key={name}
                  type="button"
                  aria-label={name}
                  onClick={() => recolor(name)}
                  className={
                    "size-6 rounded ring-1 hover:ring-2 " +
                    palette.bg +
                    " " +
                    palette.ring +
                    (isCurrent ? " ring-2 ring-offset-1 ring-heritage" : "")
                  }
                >
                  {isCurrent && (
                    <Check className="size-3 mx-auto text-ink" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Label (inline editable) */}
      <div className="flex-1 min-w-0">
        {editingLabel ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={labelDraft}
              maxLength={40}
              disabled={pending}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitLabel();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelLabel();
                }
              }}
              className="w-full max-w-[300px] rounded border border-[var(--rule-strong)] bg-white px-2 py-1 text-sm text-ink focus:border-heritage focus:outline-none"
            />
            {pending && (
              <Loader2 className="size-3.5 animate-spin text-slate-meta" />
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => canEdit && setEditingLabel(true)}
            className={
              "block text-left text-sm font-semibold text-ink truncate max-w-full " +
              (canEdit
                ? "hover:underline underline-offset-2 cursor-text"
                : "cursor-not-allowed")
            }
            title={canEdit ? "Click to rename" : undefined}
          >
            {stage.label}
          </button>
        )}
        {rowError && (
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-red-700">
            <AlertTriangle className="size-3 shrink-0" />
            {rowError}
          </p>
        )}
      </div>

      {/* Kind badge */}
      <span
        className="inline-flex items-center gap-1 rounded border border-[var(--rule)] bg-cream/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[1.5px] text-slate-meta"
        title={`System kind: ${stage.kind}`}
      >
        {KIND_DEFAULT_LABELS[stage.kind]}
      </span>

      {/* Default marker */}
      {stage.is_default && (
        <span
          className="inline-flex items-center gap-1 rounded border border-heritage/30 bg-heritage/5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[1.5px] text-heritage"
          title="Default landing stage for this kind"
        >
          <Star className="size-3" />
          Default
        </span>
      )}

      {/* Hidden marker */}
      {stage.is_hidden && (
        <span
          className="inline-flex items-center gap-1 rounded border border-[var(--rule)] bg-cream/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[1.5px] text-slate-meta"
          title="Collapsed on kanban — applications already in this stage are unaffected"
        >
          <EyeOff className="size-3" />
          Hidden
        </span>
      )}

      {/* Action menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!canEdit}
            aria-label={`Actions for ${stage.label}`}
            className={
              "rounded p-1 text-slate-meta hover:bg-cream/60 hover:text-ink " +
              (!canEdit ? "opacity-40 cursor-not-allowed" : "")
            }
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setEditingLabel(true)}>
            <Palette className="size-3.5" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleHidden}>
            {stage.is_hidden ? (
              <>
                <Eye className="size-3.5" />
                <span>Show on kanban</span>
              </>
            ) : (
              <>
                <EyeOff className="size-3.5" />
                <span>Hide from kanban</span>
              </>
            )}
          </DropdownMenuItem>
          {!stage.is_default && !stage.is_hidden && (
            <DropdownMenuItem onSelect={makeDefault}>
              <Star className="size-3.5" />
              <span>Set as default for {stage.kind}</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!deletable}
            onSelect={() => {
              if (deletable) setDeleteOpen(true);
            }}
            variant="destructive"
          >
            <Trash2 className="size-3.5" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{stage.label}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes the stage from your pipeline. Applications
              already in this stage have to be moved first. You can hide
              the stage instead if you might use it again.
            </DialogDescription>
          </DialogHeader>
          {rowError && (
            <p className="text-sm text-red-700 inline-flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              {rowError}
            </p>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="rounded-md border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm font-semibold text-slate-body hover:bg-cream/60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmDelete}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {pending ? "Deleting..." : "Delete stage"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────
 * AddStageForm
 * ────────────────────────────────────────────────────────── */

interface AddStageFormProps {
  canEdit: boolean;
  atCap: boolean;
  /** Called after a successful insert so the parent can refresh the
   *  server-rendered list and pick up the new row + its server-assigned
   *  id, sort_order, etc. */
  onAdded: () => void;
}

function AddStageForm({ canEdit, atCap, onAdded }: AddStageFormProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<StageKind>("screen");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<StageColorPaletteName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setKind("screen");
    setLabel("");
    setColor(null);
    setError(null);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Give the stage a label.");
      return;
    }
    startTransition(async () => {
      const result = await addStage({
        kind,
        label: trimmed,
        color_class: color,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      onAdded();
    });
  };

  if (!canEdit) {
    return (
      <div className="flex items-center justify-between border border-dashed border-[var(--rule)] bg-cream/30 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-[13px] text-slate-meta">
          <Plus className="size-3.5" /> Add stage
        </span>
        <span
          className="text-[11px] text-slate-meta"
          title="Upgrade to Growth to customize"
        >
          Growth+ feature
        </span>
      </div>
    );
  }

  if (atCap) {
    return (
      <div className="flex items-center gap-2 border border-dashed border-[var(--rule)] bg-cream/30 px-4 py-3 text-[12px] text-slate-meta">
        <AlertTriangle className="size-3.5 text-amber-700" />
        You&apos;ve hit the {MAX_STAGES_PER_DSO}-stage limit. Delete or
        hide a stage to add a new one.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-dashed border-[var(--rule-strong)] bg-white px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-cream/50"
      >
        <Plus className="size-3.5" />
        Add stage
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border border-[var(--rule-strong)] bg-white p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
        <div>
          <label
            htmlFor="add-stage-label"
            className="mb-1 block text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep"
          >
            Label
          </label>
          <input
            id="add-stage-label"
            type="text"
            value={label}
            maxLength={40}
            placeholder="e.g. Working interview"
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded border border-[var(--rule-strong)] bg-white px-3 py-2 text-sm text-ink focus:border-heritage focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="add-stage-kind"
            className="mb-1 block text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep"
          >
            Kind
          </label>
          <div className="relative">
            <select
              id="add-stage-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as StageKind)}
              className="w-full appearance-none rounded border border-[var(--rule-strong)] bg-white px-3 py-2 pr-8 text-sm text-ink focus:border-heritage focus:outline-none"
            >
              {STAGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_DEFAULT_LABELS[k]}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-meta" />
          </div>
        </div>
      </div>

      <div>
        <span className="mb-1 block text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
          Color
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setColor(null)}
            className={
              "rounded border px-2 py-1 text-[11px] " +
              (color === null
                ? "border-heritage text-ink font-semibold"
                : "border-[var(--rule)] text-slate-meta hover:text-ink")
            }
          >
            Default
          </button>
          {STAGE_COLOR_OPTIONS.map((name) => {
            const palette = STAGE_COLOR_PALETTE[name];
            const isCurrent = name === color;
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                onClick={() => setColor(name)}
                className={
                  "size-6 rounded ring-1 hover:ring-2 " +
                  palette.bg +
                  " " +
                  palette.ring +
                  (isCurrent ? " ring-2 ring-offset-1 ring-heritage" : "")
                }
              >
                {isCurrent && (
                  <Check className="size-3 mx-auto text-ink" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3.5" />
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--rule-strong)] bg-white px-3 py-2 text-[12px] font-semibold text-slate-body hover:bg-cream/60"
        >
          <X className="size-3.5" /> Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md bg-heritage px-3 py-2 text-[12px] font-semibold text-white hover:bg-heritage-deep disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add stage
        </button>
      </div>
    </form>
  );
}
