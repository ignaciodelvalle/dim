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
      <div className="space-y-3 rounded-[6px] border border-ln-op-line bg-ln-op-card p-4">
        <p className="text-[13px] font-medium text-ln-op-ink">
          Aceptar la custodia estatal de {petName}.
        </p>
        <p className="text-sm text-ln-op-mute">
          Tu organización asume la custodia bajo Ley 14.346. Esta acción no se puede deshacer.
        </p>
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={pending}
            className="px-4 py-2 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {pending ? "Procesando..." : "Confirmar custodia"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(null);
              setError(null);
            }}
            disabled={pending}
            className="px-4 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (mode === "reject") {
    return (
      <div className="space-y-3 rounded-[6px] border border-ln-op-line bg-ln-op-card p-4">
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
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReject}
            disabled={pending}
            className="px-4 py-2 rounded-[6px] border border-ln-op-danger text-ln-op-danger bg-ln-op-card text-[13px] font-medium hover:bg-ln-op-stripe disabled:opacity-60 transition-colors"
          >
            {pending ? "Procesando..." : "Confirmar rechazo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(null);
              setError(null);
              setRejectReason("");
            }}
            disabled={pending}
            className="px-4 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <button
        type="button"
        onClick={() => setMode("accept")}
        className="px-3 py-1.5 rounded-[6px] bg-ln-op-ok text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Aceptar custodia
      </button>
      <button
        type="button"
        onClick={() => setMode("reject")}
        className="px-3 py-1.5 rounded-[6px] border border-ln-op-line bg-ln-op-card text-sm font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
      >
        Rechazar
      </button>
    </div>
  );
}
