"use client";

import { useState, useTransition } from "react";

import {
  acceptCrossOrgTransferAction,
  rejectCrossOrgTransferAction,
} from "@/src/modules/transfers/actions";

export function IncomingTransferActions({
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
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);

  // Reject-only fields (action supports reason + message)
  const [rejectReason, setRejectReason] = useState("");
  const [rejectMessage, setRejectMessage] = useState("");

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptCrossOrgTransferAction({
        receiverOrgToken,
        casePublicCode,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // revalidatePath fires server-side — the list re-renders automatically.
      setDone(true);
    });
  }

  function handleReject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectCrossOrgTransferAction({
        receiverOrgToken,
        casePublicCode,
        reason: rejectReason.trim() || null,
        message: rejectMessage.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-sm text-ln-op-ok font-medium">
        {mode === "accept" ? "Transferencia aceptada." : "Transferencia rechazada."}
      </p>
    );
  }

  if (mode === "accept") {
    return (
      <div className="space-y-3 rounded-[6px] border border-ln-op-line bg-ln-op-card p-4">
        <p className="text-[13px] font-medium text-ln-op-ink">
          Aceptar la transferencia de {petName}.
        </p>
        <p className="text-sm text-ln-op-mute">
          La custodia pasa a tu organización. Esta acción no se puede deshacer.
        </p>
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={pending}
            className="px-4 py-2 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {pending ? "Procesando..." : "Confirmar aceptación"}
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
          Rechazar la transferencia de {petName}.
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          placeholder="Motivo del rechazo (opcional)"
          className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
        <textarea
          value={rejectMessage}
          onChange={(e) => setRejectMessage(e.target.value)}
          rows={2}
          placeholder="Mensaje para la organización remitente (opcional)"
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
              setRejectMessage("");
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
        Aceptar
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
