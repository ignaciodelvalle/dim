"use client";

// Receiver-side accept/reject UI for an incoming decomiso (court-ordered state
// seizure under Ley 14.346). Mirrors IncomingTransferActions but wires the
// decomiso-specific actions:
//   acceptDecomisoHandoffAction — receiver org takes custody (new custody_episode).
//   rejectDecomisoHandoffAction — receiver declines; govt retains the open episode.
//
// Both actions revalidate server-side; we also do a full document reload so
// the row's status flips immediately (custody episodes change hands here —
// SSR custody state must match the DB, and router.refresh() is banned; see
// lib/ui/full-page-action-nav.ts).

import { useState, useTransition } from "react";

import { acceptDecomisoHandoffAction, rejectDecomisoHandoffAction } from "@/app/actions/decomiso";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

export function DecomisoHandoffActions({
  receiverOrgToken,
  casePublicCode,
  petName,
}: {
  receiverOrgToken: string;
  casePublicCode: string;
  petName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);

  // Reject-only field — optional reason recorded on the rejection note.
  const [rejectReason, setRejectReason] = useState("");

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptDecomisoHandoffAction({
        receiverOrgToken,
        casePublicCode,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      navigateAfterActionSuccess(window.location.href);
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectDecomisoHandoffAction({
        receiverOrgToken,
        casePublicCode,
        reason: rejectReason.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      navigateAfterActionSuccess(window.location.href);
    });
  }

  if (mode === "accept") {
    return (
      <div className="space-y-3 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4">
        <p className="text-[13px] font-medium text-ln-op-ink">
          Aceptar la custodia estatal de {petName}.
        </p>
        <p className="text-sm text-ln-op-mute">
          Tu organización asume la custodia bajo Ley 14.346. Esta acción no se puede deshacer.
        </p>
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
        <div className="flex gap-2">
          <OpButton type="button" variant="ok" onClick={handleAccept} disabled={pending}>
            {pending ? "Procesando..." : "Confirmar custodia"}
          </OpButton>
          <OpButton
            type="button"
            variant="ghost"
            onClick={() => {
              setMode(null);
              setError(null);
            }}
            disabled={pending}
          >
            Cancelar
          </OpButton>
        </div>
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div className="space-y-3 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4">
        <p className="text-[13px] font-medium text-ln-op-ink">
          Rechazar la custodia estatal de {petName}.
        </p>
        <p className="text-sm text-ln-op-mute">
          La autoridad sanitaria mantiene la custodia transitoria del animal.
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          placeholder="Motivo del rechazo (opcional)"
          className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
        <div className="flex gap-2">
          <OpButton type="button" variant="danger" onClick={handleReject} disabled={pending}>
            {pending ? "Procesando..." : "Confirmar rechazo"}
          </OpButton>
          <OpButton
            type="button"
            variant="ghost"
            onClick={() => {
              setMode(null);
              setError(null);
              setRejectReason("");
            }}
            disabled={pending}
          >
            Cancelar
          </OpButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <OpButton type="button" size="sm" variant="ok" onClick={() => setMode("accept")}>
        Aceptar custodia
      </OpButton>
      <OpButton type="button" size="sm" variant="danger" onClick={() => setMode("reject")}>
        Rechazar
      </OpButton>
    </div>
  );
}
