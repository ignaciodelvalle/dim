"use client";

// ReasignarButton — triggers the reassignDecomisoToAnotherReceiverAction
// for pending custody_episode cases.
//
// Spec DC9: when the current receiver rejects, or the govt wants to
// reassign proactively, this button opens a mini-form to select a new
// receiver and optionally enter a reason.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reassignDecomisoToAnotherReceiverAction } from "@/app/actions/decomiso";

type ReasignarButtonProps = {
  casePublicCode: string;
  currentReceiverName: string;
};

export function ReasignarButton({ casePublicCode, currentReceiverName }: ReasignarButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newReceiverId, setNewReceiverId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!newReceiverId.trim()) {
      setError("Ingresá el ID del nuevo refugio destinatario.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reassignDecomisoToAnotherReceiverAction({
        casePublicCode,
        newReceiverOrgId: newReceiverId.trim(),
        reason: reason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNewReceiverId("");
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg border border-gob-border text-gob-text hover:bg-gob-surface-alt transition-colors text-xs"
      >
        Reasignar
      </button>
    );
  }

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none bg-transparent border-none"
      aria-label={`Reasignar decomiso ${casePublicCode}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gob-text/40"
        onClick={() => !isPending && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && !isPending && setOpen(false)}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white border border-gob-border shadow-xl p-6 space-y-4">
        <h3 className="text-base font-semibold text-gob-text">
          Reasignar decomiso — {casePublicCode}
        </h3>
        <p className="text-sm text-gob-text-muted">
          Receptor actual: <span className="text-gob-text font-medium">{currentReceiverName}</span>
        </p>

        <div className="space-y-1">
          <label htmlFor="newReceiverId" className="block text-xs font-medium text-gob-text">
            ID del nuevo refugio destinatario
          </label>
          <input
            id="newReceiverId"
            type="text"
            value={newReceiverId}
            onChange={(e) => setNewReceiverId(e.target.value)}
            placeholder="UUID del refugio (shelter / rescue_network verificado)"
            className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm font-mono text-gob-text focus:outline-none focus:border-gob-primary"
          />
          <p className="text-xs text-gob-text-muted">
            Podés obtener el UUID desde la sección Organizaciones.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="reassignReason" className="block text-xs font-medium text-gob-text">
            Motivo de reasignación (opcional)
          </label>
          <textarea
            id="reassignReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Por ej: el refugio anterior rechazó por falta de espacio."
            className="block w-full px-3 py-2 rounded-lg border border-gob-border-strong bg-white text-sm text-gob-text focus:outline-none focus:border-gob-primary resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-gob-danger rounded-lg bg-gob-danger/10 border border-gob-danger/30 px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !newReceiverId.trim()}
            className="flex-1 py-2.5 rounded-xl bg-gob-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Reasignando..." : "Confirmar reasignación"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-xl border border-gob-border text-sm text-gob-text hover:bg-gob-surface-alt transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </dialog>
  );
}
