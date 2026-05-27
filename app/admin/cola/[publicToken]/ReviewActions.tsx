"use client";

// Same component as /gob/cola/[publicToken]/ReviewActions.tsx — the approval
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
          className="w-full text-xs rounded-md border border-gob-border-strong bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md bg-gob-success text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? "Aprobando..." : "Confirmar aprobación"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setNotes("");
              setError(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-gob-border-strong hover:bg-gob-surface-alt transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-gob-danger">{error}</p>}
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
          className="w-full text-xs rounded-md border border-gob-border-strong bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending || tooShort}
            className="text-xs px-3 py-1.5 rounded-md bg-red-700 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
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
            className="text-xs px-3 py-1.5 rounded-md border border-gob-border-strong hover:bg-gob-surface-alt transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-gob-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMode("approving")}
        disabled={pending}
        className="text-sm px-4 py-2 rounded-md bg-gob-success text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        onClick={() => setMode("rejecting")}
        disabled={pending}
        className="text-sm px-4 py-2 rounded-md border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <p className="text-xs text-gob-danger">{error}</p>}
    </div>
  );
}
