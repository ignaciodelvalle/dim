"use client";

// ReasignarButton -- triggers the reassignDecomisoToAnotherReceiverAction
// for pending custody_episode cases.
//
// Spec DC9: when the current receiver rejects, or the govt wants to
// reassign proactively, this button opens a mini-form to select a new
// receiver and optionally enter a reason.

import { useState, useTransition } from "react";

import { reassignDecomisoToAnotherReceiverAction } from "@/app/actions/decomiso";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

type ReceiverOrgOption = {
  id: string;
  displayName: string;
  orgType: string;
};

const ORG_TYPE_LABEL: Record<string, string> = {
  shelter: "Refugio",
  rescue_network: "Red de rescate",
};

type ReasignarButtonProps = {
  casePublicCode: string;
  currentReceiverName: string;
  /** Excluded from the picker — reassigning to the same org is a no-op the
   * server already rejects, but there's no reason to offer it. */
  currentReceiverOrgId: string | null;
  /** Verified + active shelter/rescue_network orgs (same eligibility gate as
   * validateReceiverOrg) — display-only convenience; submit re-validates. */
  receiverOrgs: ReceiverOrgOption[];
};

export function ReasignarButton({
  casePublicCode,
  currentReceiverName,
  currentReceiverOrgId,
  receiverOrgs,
}: ReasignarButtonProps) {
  const [open, setOpen] = useState(false);
  const [newReceiverId, setNewReceiverId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableReceivers = receiverOrgs.filter((r) => r.id !== currentReceiverOrgId);

  function handleSubmit() {
    if (!newReceiverId) {
      setError("Elegí el nuevo refugio destinatario.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reassignDecomisoToAnotherReceiverAction({
        casePublicCode,
        newReceiverOrgId: newReceiverId,
        reason: reason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNewReceiverId("");
      setReason("");
      // Full document reload so the SSR page reflects the mutation
      // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
      navigateAfterActionSuccess(window.location.href);
    });
  }

  if (!open) {
    return (
      <OpButton type="button" onClick={() => setOpen(true)} variant="ghost" size="sm">
        Reasignar
      </OpButton>
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
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-lg)] bg-ln-op-card border border-ln-op-line shadow-xl p-6 space-y-4">
        <h3 className="text-[15px] font-semibold text-ln-op-ink">
          Reasignar decomiso — {casePublicCode}
        </h3>
        <p className="text-[13px] text-ln-op-mute">
          Receptor actual: <span className="text-ln-op-ink font-medium">{currentReceiverName}</span>
        </p>

        <div className="space-y-1">
          <label htmlFor="newReceiverId" className="block text-sm font-medium text-ln-op-ink">
            Nuevo refugio destinatario
          </label>
          <select
            id="newReceiverId"
            value={newReceiverId}
            onChange={(e) => setNewReceiverId(e.target.value)}
            disabled={availableReceivers.length === 0}
            className="block w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
          >
            <option value="">Elegí una organización verificada…</option>
            {availableReceivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.displayName} · {ORG_TYPE_LABEL[r.orgType] ?? r.orgType}
              </option>
            ))}
          </select>
          <p className="text-sm text-ln-op-mute">
            {availableReceivers.length === 0
              ? "No hay refugios verificados disponibles para reasignar."
              : "Solo aparecen refugios/redes de rescate verificados y activos."}
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="reassignReason" className="block text-sm font-medium text-ln-op-ink">
            Motivo de reasignacion (opcional)
          </label>
          <textarea
            id="reassignReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Por ej: el refugio anterior rechazo por falta de espacio."
            className="block w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul resize-none"
          />
        </div>

        {error && (
          <p className="text-[13px] text-ln-op-danger rounded-[var(--radius-md)] bg-ln-op-danger-bg border border-ln-op-danger-bd px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <OpButton
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !newReceiverId}
            variant="primary"
            block
            className="py-2.5"
          >
            {isPending ? "Reasignando..." : "Confirmar reasignacion"}
          </OpButton>
          <OpButton
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            variant="ghost"
            block
            className="py-2.5"
          >
            Cancelar
          </OpButton>
        </div>
      </div>
    </dialog>
  );
}
