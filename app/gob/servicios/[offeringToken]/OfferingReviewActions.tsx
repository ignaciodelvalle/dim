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
        <p className="text-xs text-gob-text-gray ">
          Vas a aprobar este servicio. El proveedor recibirá una notificación.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-md bg-gob-success  text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? "Aprobando..." : "Confirmar aprobación"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("idle");
              setError(null);
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-gob-border  hover:bg-gob-surface-alt  transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-gob-danger ">{error}</p>}
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
          className="w-full text-xs rounded-md border border-gob-border  bg-white  px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gob-primary "
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reject}
            disabled={pending || tooShort}
            className="text-xs px-3 py-1.5 rounded-md bg-gob-danger  text-white hover:opacity-90 transition-opacity disabled:opacity-50"
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
            className="text-xs px-3 py-1.5 rounded-md border border-gob-border  hover:bg-gob-surface-alt  transition-colors"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-gob-danger ">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setMode("approving")}
        disabled={pending}
        className="text-sm px-4 py-2 rounded-md bg-gob-success  text-white hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Aprobar
      </button>
      <button
        type="button"
        onClick={() => setMode("rejecting")}
        disabled={pending}
        className="text-sm px-4 py-2 rounded-md border border-gob-danger  text-gob-danger  hover:bg-gob-danger/10  transition-colors disabled:opacity-50"
      >
        Rechazar
      </button>
      {error && <p className="text-xs text-gob-danger ">{error}</p>}
    </div>
  );
}
