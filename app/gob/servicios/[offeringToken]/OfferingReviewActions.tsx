"use client";

// Client component for approve/reject actions on a service offering (Fase 9).
// Mirrors the pattern used in /gob/cola/[publicToken]/ReviewActions.tsx.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveServiceOfferingAction,
  rejectServiceOfferingAction,
} from "@/app/actions/service-offerings";
import { OpButton } from "@/components/ui/dashboard";

type Mode = "idle" | "approving" | "rejecting";

export function OfferingReviewActions({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveServiceOfferingAction(publicToken);
      if (result.error) setError(result.error);
      else {
        setMode("idle");
        router.refresh();
      }
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectServiceOfferingAction(publicToken, reason);
      if (result.error) setError(result.error);
      else {
        setMode("idle");
        setReason("");
        router.refresh();
      }
    });
  }

  if (mode === "approving") {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-ln-op-ink-2">
          Vas a aprobar este servicio. El proveedor recibirá una notificación.
        </p>
        <div className="flex items-center gap-2">
          <OpButton type="button" onClick={approve} disabled={pending} variant="ok" size="sm">
            {pending ? "Aprobando..." : "Confirmar aprobacion"}
          </OpButton>
          <OpButton
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            variant="ghost"
            size="sm"
          >
            Cancelar
          </OpButton>
        </div>
        {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
      </div>
    );
  }

  if (mode === "rejecting") {
    const tooShort = reason.trim().length < 10;
    return (
      <div className="space-y-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo del rechazo (minimo 10 caracteres). Se envia al proveedor."
          rows={3}
          className="w-full text-[12px] rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 text-ln-op-ink placeholder:text-ln-op-mute focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <div className="flex items-center gap-2">
          <OpButton
            type="button"
            onClick={reject}
            disabled={pending || tooShort}
            variant="danger"
            size="sm"
          >
            {pending ? "Rechazando..." : "Confirmar rechazo"}
          </OpButton>
          <OpButton
            type="button"
            onClick={() => {
              setMode("idle");
              setReason("");
              setError(null);
            }}
            variant="ghost"
            size="sm"
          >
            Cancelar
          </OpButton>
        </div>
        {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <OpButton type="button" onClick={() => setMode("approving")} disabled={pending} variant="ok">
        Aprobar
      </OpButton>
      <button
        type="button"
        onClick={() => setMode("rejecting")}
        disabled={pending}
        className="text-[13px] px-4 py-2 rounded-[6px] border border-ln-op-danger text-ln-op-danger hover:bg-ln-op-danger-bg transition-colors disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
    </div>
  );
}
