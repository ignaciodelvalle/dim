"use client";

// ConfirmDialog — accessible modal confirmation dialog backed by <dialog>.showModal().
//
// Uses the native <dialog> element so the browser provides:
//   - Automatic focus trap (keyboard navigation stays inside the dialog)
//   - Escape key dismissal via the native `cancel` event
//   - Proper aria role without manual role="dialog" hacks
//
// Design tokens: supports both ln-* (owner tier) and ln-op-* (operator tier).
// Tone prop controls the destructive-action button color.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   const triggerRef = useRef<HTMLButtonElement>(null);
//
//   <button ref={triggerRef} onClick={() => setOpen(true)}>Eliminar</button>
//   <ConfirmDialog
//     open={open}
//     onClose={() => setOpen(false)}
//     onConfirm={handleDelete}
//     title="Eliminar regla"
//     description="Esta acción no se puede deshacer."
//     confirmLabel="Eliminar"
//     tone="danger"
//     triggerRef={triggerRef}
//   />

import { useEffect, useRef } from "react";

export type ConfirmDialogTone = "danger" | "warn" | "neutral";

const confirmBtnClass: Record<ConfirmDialogTone, string> = {
  danger: "bg-[var(--color-ln-seal)] hover:opacity-90 focus-visible:ring-[var(--color-ln-seal)]",
  warn: "bg-[var(--color-ln-warn)] hover:opacity-90 focus-visible:ring-[var(--color-ln-warn)]",
  neutral:
    "bg-[var(--color-ln-azul)] hover:bg-[var(--color-ln-azul-700)] focus-visible:ring-[var(--color-ln-azul)]",
};

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
  pending?: boolean;
  /** Ref to the element that triggered the dialog — focus returns here on close. */
  triggerRef?: React.RefObject<HTMLElement | null>;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
  pending = false,
  triggerRef,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useRef(`confirm-dialog-title-${Math.random().toString(36).slice(2)}`).current;

  // Open/close the native dialog imperatively.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (open) {
      if (!el.open) el.showModal();
    } else {
      if (el.open) el.close();
    }
  }, [open]);

  // Sync native cancel event (Escape key) back to React state.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handleCancel = (e: Event) => {
      e.preventDefault(); // prevent the browser from closing before React state syncs
      onClose();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  // Return focus to the trigger when the dialog closes.
  useEffect(() => {
    if (!open && triggerRef?.current) {
      triggerRef.current.focus();
    }
  }, [open, triggerRef]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onClose={onClose}
      className={[
        "m-auto max-w-[360px] w-full rounded-[6px] p-0",
        "border border-[var(--color-ln-line-strong)]",
        "bg-[var(--color-ln-card)] shadow-[0_18px_50px_rgba(20,40,60,.22)]",
        // Backdrop via CSS — the native ::backdrop pseudo-element
        "[&::backdrop]:bg-black/40",
        "open:flex open:flex-col",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h2
          id={titleId}
          className="text-[15px] font-semibold text-[var(--color-ln-ink)] leading-snug"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-[13px] text-[var(--color-ln-ink-2)] leading-snug">
            {description}
          </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 justify-end px-5 py-4 border-t border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)]">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className={[
            "rounded-[3px] border border-[var(--color-ln-line-strong)]",
            "bg-[var(--color-ln-card)] px-4 py-2 text-sm font-medium",
            "text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)]",
            "disabled:opacity-50 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)]",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={[
            "rounded-[3px] px-4 py-2 text-sm font-semibold text-white",
            "disabled:opacity-50 transition-opacity",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            confirmBtnClass[tone],
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {pending ? "Procesando…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
