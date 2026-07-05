"use client";

import { useState, useTransition } from "react";

import { OpButton } from "@/components/ui/dashboard";
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
      <div className="space-y-3 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card p-4">
        <p className="text-[13px] font-medium text-ln-op-ink">
          Aceptar la transferencia de {petName}.
        </p>
        <p className="text-sm text-ln-op-mute">
          La custodia pasa a tu organización. Esta acción no se puede deshacer.
        </p>
        {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
        <div className="flex gap-2">
          <OpButton type="button" variant="ok" onClick={handleAccept} disabled={pending}>
            {pending ? "Procesando..." : "Confirmar aceptación"}
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
          Rechazar la transferencia de {petName}.
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={2}
          placeholder="Motivo del rechazo (opcional)"
          className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul"
        />
        <textarea
          value={rejectMessage}
          onChange={(e) => setRejectMessage(e.target.value)}
          rows={2}
          placeholder="Mensaje para la organización remitente (opcional)"
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
              setRejectMessage("");
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
        Aceptar
      </OpButton>
      <OpButton type="button" size="sm" variant="danger" onClick={() => setMode("reject")}>
        Rechazar
      </OpButton>
    </div>
  );
}
