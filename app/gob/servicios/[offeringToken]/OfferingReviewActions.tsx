"use client";

// Client component for approve/reject actions on a service offering (Fase 9).
// Mirrors the pattern used in /gob/cola/[publicToken]/ReviewActions.tsx.

import { useState, useTransition } from "react";

import {
  approveServiceOfferingAction,
  rejectServiceOfferingAction,
} from "@/app/actions/service-offerings";

type Mode = "idle" | "approving" | "rejecting";

export function OfferingReviewActions({ publicToken }: { publicToken: string }) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveServiceOfferingAction(publicToken);
      if (result.error) setError(result.error);
      else setMode("idle");
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
      }
    });
  }

  if (mode === "approving") {
    return (
      <div className="space-y-2">
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Vas a aprobar este servicio. El proveedor recibirá una notificación.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md bg-emerald-700 dark:bg-emerald-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? "Aprobando..." : "Confirmar aprobación"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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
          placeholder="Motivo del rechazo (mínimo 10 caracteres). Se envía al proveedor."
          rows={3}
          className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending || tooShort}
            className="text-xs px-3 py-1.5 rounded-md bg-red-600 dark:bg-red-700 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
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
            className="text-xs px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMode("approving")}
        disabled={pending}
        className="text-sm px-4 py-2 rounded-md bg-emerald-700 dark:bg-emerald-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        onClick={() => setMode("rejecting")}
        disabled={pending}
        className="text-sm px-4 py-2 rounded-md border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
