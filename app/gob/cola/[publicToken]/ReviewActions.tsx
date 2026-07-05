"use client";

import { useState, useTransition } from "react";

import { approveRequestAction, rejectRequestAction } from "@/app/actions/admin-decisions";
import { OpButton } from "@/components/ui/dashboard";
import { navigateAfterActionSuccess } from "@/lib/ui/full-page-action-nav";

type Mode = "idle" | "approving" | "rejecting";

export function ReviewActions({ publicToken }: { publicToken: string }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveRequestAction(publicToken, notes.trim() || null);
      if ("error" in result) setError(result.error);
      else {
        setMode("idle");
        setNotes("");
        // Full document reload so the SSR page reflects the mutation
        // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
        navigateAfterActionSuccess(window.location.href);
      }
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectRequestAction(publicToken, reason);
      if ("error" in result) setError(result.error);
      else {
        setMode("idle");
        setReason("");
        // Full document reload so the SSR page reflects the mutation
        // (router.refresh() is banned - see lib/ui/full-page-action-nav.ts).
        navigateAfterActionSuccess(window.location.href);
      }
    });
  }

  if (mode === "approving") {
    return (
      <div className="space-y-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas para el aplicante (opcional)."
          rows={2}
          className="w-full text-sm rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ln-op-azul text-ln-op-ink placeholder:text-ln-op-faint"
        />
        <div className="flex items-center gap-2">
          <OpButton type="button" onClick={approve} disabled={pending} variant="ok" size="sm">
            {pending ? "Aprobando..." : "Confirmar aprobación"}
          </OpButton>
          <OpButton
            type="button"
            onClick={() => {
              setMode("idle");
              setNotes("");
              setError(null);
            }}
            variant="ghost"
            size="sm"
          >
            Cancelar
          </OpButton>
        </div>
        {error && <p className="text-sm text-ln-op-danger">{error}</p>}
      </div>
    );
  }

  if (mode === "rejecting") {
    const tooShort = reason.trim().length < 5;
    return (
      <div className="space-y-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Razón del rechazo (mínimo 5 caracteres). Se envía al aplicante."
          rows={3}
          className="w-full text-sm rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ln-op-azul text-ln-op-ink placeholder:text-ln-op-faint"
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
        {error && <p className="text-sm text-ln-op-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <OpButton type="button" onClick={() => setMode("approving")} disabled={pending} variant="ok">
        Aprobar
      </OpButton>
      <OpButton
        type="button"
        onClick={() => setMode("rejecting")}
        disabled={pending}
        variant="danger"
      >
        Rechazar
      </OpButton>
      {error && <p className="text-sm text-ln-op-danger">{error}</p>}
    </div>
  );
}
