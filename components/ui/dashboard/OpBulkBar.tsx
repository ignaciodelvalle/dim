"use client";

// OpBulkBar — generic sticky bulk-action bar (Wave 2 Item 10.2).
//
// Appears when count ≥ 1. Renders "N seleccionados", a "Limpiar" (clear)
// button, and one button per action. Destructive actions that declare
// `requireReason` open a ConfirmDialog collecting a mandatory motivo (min
// length configurable — defaults to 5 chars, matching bulkRejectRequestsAction;
// the revoke flow passes 30 to match bulkRevokeAction).
//
// This is a presentation primitive: it does NOT own selection state (the queue
// owns the Set of selected ids and passes `count`) and it does NOT call server
// actions itself — each action's `onRun` is supplied by the caller, which knows
// which bulk server action and payload shape applies.
//
// A11y:
//   - role="region" aria-label="Acciones en lote" on the bar.
//   - count announced via aria-live="polite".
//   - destructive confirm reuses the accessible ConfirmDialog (native <dialog>,
//     focus trap, Escape to cancel, focus returns to trigger).

import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OpButton } from "@/components/ui/dashboard/OpButton";
import { isReasonValid, selectionSummary } from "@/lib/domain/bulk-select";

export type OpBulkAction = {
  /** Stable key for React + the action button id. */
  key: string;
  /** Button label, e.g. "Revocar seleccionados". */
  label: string;
  /** Visual tone. "danger" renders a red button; non-destructive default to neutral. */
  tone?: "danger" | "neutral";
  /**
   * When true, clicking opens a ConfirmDialog requiring a reason before `onRun`
   * is called. `onRun` receives the trimmed reason. When false/omitted, `onRun`
   * is called immediately with an empty string.
   */
  requireReason?: boolean;
  /** Minimum reason length in chars. Defaults to 5. Ignored unless requireReason. */
  minReasonLength?: number;
  /** Confirm dialog title (defaults to the action label). */
  confirmTitle?: string;
  /** Confirm dialog description. */
  confirmDescription?: string;
  /** Runs the bulk action. May be async; the bar shows a pending state. */
  onRun: (reason: string) => void | Promise<void>;
  /** Disables this action's button (e.g. nothing eligible in selection). */
  disabled?: boolean;
};

type Props = {
  /** Number of selected rows. The bar is hidden when count === 0. */
  count: number;
  /** Actions rendered as buttons in the bar. */
  actions: OpBulkAction[];
  /** Clears the selection. */
  onClear: () => void;
};

const DEFAULT_MIN_REASON = 5;

export function OpBulkBar({ count, actions, onClear }: Props) {
  const [activeAction, setActiveAction] = useState<OpBulkAction | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (count === 0) return null;

  const minReason = activeAction?.minReasonLength ?? DEFAULT_MIN_REASON;
  const reasonValid = isReasonValid(reason, minReason);

  async function runAction(action: OpBulkAction, withReason: string) {
    setPending(true);
    try {
      await action.onRun(withReason);
    } finally {
      setPending(false);
      setActiveAction(null);
      setReason("");
    }
  }

  function handleClick(action: OpBulkAction, e: React.MouseEvent<HTMLButtonElement>) {
    if (action.requireReason) {
      triggerRef.current = e.currentTarget;
      setActiveAction(action);
      setReason("");
    } else {
      void runAction(action, "");
    }
  }

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: the spec (Wave 2 Item 10.2) mandates the explicit role="region" + aria-label landmark; a bare <section> would not surface the literal role attribute consumers assert on. */}
      <div
        role="region"
        aria-label="Acciones en lote"
        className="sticky bottom-4 z-[var(--z-header)] mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-ln-op-line bg-ln-op-card px-4 py-3 shadow-lg"
      >
        <span aria-live="polite" className="text-[13px] font-medium text-ln-op-ink-2">
          {selectionSummary(count)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-3 py-1.5 text-[13px] text-ln-op-ink-2 hover:bg-ln-op-stripe"
          >
            Limpiar
          </button>
          {actions.map((action) => (
            <OpButton
              key={action.key}
              type="button"
              variant={action.tone === "danger" ? "danger" : "primary"}
              size="sm"
              disabled={action.disabled || pending}
              onClick={(e) => handleClick(action, e)}
            >
              {action.label}
            </OpButton>
          ))}
        </div>
      </div>

      {activeAction && (
        <ConfirmDialog
          open={true}
          onClose={() => {
            if (!pending) {
              setActiveAction(null);
              setReason("");
            }
          }}
          onConfirm={() => {
            if (reasonValid && !pending) void runAction(activeAction, reason.trim());
          }}
          title={activeAction.confirmTitle ?? activeAction.label}
          description={activeAction.confirmDescription}
          confirmLabel="Confirmar"
          tone={activeAction.tone === "danger" ? "danger" : "neutral"}
          pending={pending}
          triggerRef={triggerRef}
        >
          <div className="px-5 pb-2">
            <label
              htmlFor="op-bulk-reason"
              className="mb-1 block text-sm font-medium text-[var(--color-ln-ink-2)]"
            >
              Motivo (mínimo {minReason} caracteres)
            </label>
            <textarea
              id="op-bulk-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              disabled={pending}
              className="w-full rounded-md border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-2 text-[13px] text-[var(--color-ln-ink)] disabled:opacity-50"
              placeholder="Describí el motivo de esta acción."
            />
            <p className="mt-1 text-[11px] text-[var(--color-ln-ink-2)]">
              {reason.trim().length}/{minReason}
              {!reasonValid && reason.length > 0 && " — motivo demasiado corto"}
            </p>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
}
