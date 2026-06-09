"use client";

// ReasignarButton -- triggers the reassignDecomisoToAnotherReceiverAction
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
      setError("Ingresa el ID del nuevo refugio destinatario.");
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
        className="px-3 py-1.5 rounded-[6px] border border-ln-op-line text-ln-op-ink hover:bg-ln-op-stripe transition-colors text-[12px]"
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
        className="absolute inset-0 bg-ln-op-ink/40"
        onClick={() => !isPending && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && !isPending && setOpen(false)}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-[8px] bg-ln-op-card border border-ln-op-line shadow-xl p-6 space-y-4">
        <h3 className="text-[15px] font-semibold text-ln-op-ink">
          Reasignar decomiso — {casePublicCode}
        </h3>
        <p className="text-[13px] text-ln-op-mute">
          Receptor actual: <span className="text-ln-op-ink font-medium">{currentReceiverName}</span>
        </p>

        <div className="space-y-1">
          <label htmlFor="newReceiverId" className="block text-[12px] font-medium text-ln-op-ink">
            ID del nuevo refugio destinatario
          </label>
          <input
            id="newReceiverId"
            type="text"
            value={newReceiverId}
            onChange={(e) => setNewReceiverId(e.target.value)}
            placeholder="UUID del refugio (shelter / rescue_network verificado)"
            className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-mono text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
          />
          <p className="text-[12px] text-ln-op-mute">
            Podes obtener el UUID desde la seccion Organizaciones.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="reassignReason" className="block text-[12px] font-medium text-ln-op-ink">
            Motivo de reasignacion (opcional)
          </label>
          <textarea
            id="reassignReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Por ej: el refugio anterior rechazo por falta de espacio."
            className="block w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul resize-none"
          />
        </div>

        {error && (
          <p className="text-[13px] text-ln-op-danger rounded-[6px] bg-ln-op-danger-bg border border-ln-op-danger-bd px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !newReceiverId.trim()}
            className="flex-1 py-2.5 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-semibold hover:bg-ln-op-azul-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Reasignando..." : "Confirmar reasignacion"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-[6px] border border-ln-op-line text-[13px] text-ln-op-ink hover:bg-ln-op-stripe transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </dialog>
  );
}
