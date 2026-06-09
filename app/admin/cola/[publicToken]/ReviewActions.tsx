"use client";

// Same component as /gob/cola/[publicToken]/ReviewActions.tsx - the approval
// and rejection actions are shared. Kept as a local file to avoid cross-segment
// imports between route groups.

import { useState, useTransition } from "react";

import { approveRequestAction, rejectRequestAction } from "@/app/actions/admin-decisions";

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
          className="w-full rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 font-ln-sans text-[12px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="rounded-[6px] bg-ln-op-ok px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Aprobando..." : "Confirmar aprobacion"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setNotes("");
              setError(null);
            }}
            className="rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[12px] text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
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
          placeholder="Razon del rechazo (minimo 5 caracteres). Se envia al aplicante."
          rows={3}
          className="w-full rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 font-ln-sans text-[12px] text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending || tooShort}
            className="rounded-[6px] bg-ln-op-danger px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Rechazando..." : "Confirmar rechazo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setReason("");
              setError(null);
            }}
            className="rounded-[6px] border border-ln-op-line px-3 py-1.5 text-[12px] text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMode("approving")}
        disabled={pending}
        className="rounded-[6px] bg-ln-op-ok px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        onClick={() => setMode("rejecting")}
        disabled={pending}
        className="rounded-[6px] border border-ln-op-danger px-4 py-2 text-[13px] font-medium text-ln-op-danger transition-colors hover:bg-ln-op-danger-bg disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <p className="text-[12px] text-ln-op-danger">{error}</p>}
    </div>
  );
}
