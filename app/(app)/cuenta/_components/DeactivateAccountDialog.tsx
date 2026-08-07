"use client";

// DeactivateAccountDialog — confirms personal-account deactivation.
//
// Personal-account owners do not need a coverage-check (that's govt-only),
// but they do need a mandatory motivo (≥ 5 chars) to confirm intent. The
// dialog is visually separated from routine actions (Zona de riesgo section).
//
// The server action returns an error string or ok:true. On success the page
// is reloaded so the user sees the deactivated state (or is redirected by
// the layout guard).

import { useRef, useState, useTransition } from "react";

import { selfDeactivatePersonalAccountAction } from "@/app/actions/profile-self-service";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeactivateAccountDialog() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    setReason("");
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    if (reason.trim().length < 5) return;
    startTransition(async () => {
      const result = await selfDeactivatePersonalAccountAction(reason.trim());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      // Reload so the layout guard redirects to /login or shows the deactivated state.
      window.location.replace("/");
    });
  }

  const canConfirm = reason.trim().length >= 5;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="flex w-full items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[18px] py-3.5 no-underline last:border-b-0 hover:bg-[var(--color-ln-err-050)] transition-colors text-left"
      >
        <div className="min-w-0">
          <p className="text-md font-medium leading-tight text-[var(--color-ln-err)]">
            Desactivar mi cuenta
          </p>
          <p className="mt-0.5 text-sm text-[var(--color-ln-mute)]">
            Desactiva tu cuenta de miMAR — acción irreversible desde este panel
          </p>
        </div>
        <span aria-hidden="true" className="flex-shrink-0 text-[var(--color-ln-err)] text-base">
          ›
        </span>
      </button>

      <ConfirmDialog
        open={open}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title="Desactivar mi cuenta"
        description="Esta acción es irreversible desde el panel. Para reactivar tu cuenta contactá al soporte."
        confirmLabel="Desactivar cuenta"
        cancelLabel="Cancelar"
        tone="danger"
        pending={isPending}
        triggerRef={triggerRef}
      >
        <div className="px-5 pb-3 space-y-2">
          <label
            htmlFor="deactivate-reason"
            className="block text-sm font-medium text-[var(--color-ln-ink-2)]"
          >
            Motivo{" "}
            <span className="text-[var(--color-ln-mute)]">(obligatorio, mín. 5 caracteres)</span>
          </label>
          <textarea
            id="deactivate-reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={3}
            placeholder="Ej: Ya no necesito la cuenta, me mudé al exterior, etc."
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2 text-md text-[var(--color-ln-ink)] placeholder-[var(--color-ln-faint)] outline-none focus:border-[var(--color-ln-err)] focus:shadow-[0_0_0_3px_var(--color-ln-err-050)] resize-none"
          />
          {!canConfirm && reason.length > 0 && (
            <p className="text-sm text-[var(--color-ln-warn)]">Necesitás al menos 5 caracteres.</p>
          )}
          {error && <p className="text-sm text-[var(--color-ln-err)]">{error}</p>}
        </div>
      </ConfirmDialog>
    </>
  );
}
