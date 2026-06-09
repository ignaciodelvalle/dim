"use client";

// PhysicalTagInterestCard — §4.20 placeholder card on the pet profile.
//
// Lets the owner express interest in a future physical-QR tag without
// committing the app to a manufacturer / serial / `/t/[serial]` chain.
// One row per (pet, user) toggled via togglePhysicalTagInterestAction.
//
// Optimistic UI: clicking the button updates state immediately and falls
// back to the server-returned state on response. Errors revert the state
// and surface a small inline message.

import { useState, useTransition } from "react";

import { togglePhysicalTagInterestAction } from "@/app/actions/physical-tag-interest";

interface Props {
  petPublicToken: string;
  petName: string;
  initialInterested: boolean;
  initialRequestedAt: Date | null;
}

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function PhysicalTagInterestCard({
  petPublicToken,
  petName,
  initialInterested,
  initialRequestedAt,
}: Props) {
  const [interested, setInterested] = useState(initialInterested);
  const [requestedAt, setRequestedAt] = useState<Date | null>(initialRequestedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    setError(null);
    const optimisticNext = !interested;
    setInterested(optimisticNext);
    if (optimisticNext) {
      setRequestedAt((prev) => prev ?? new Date());
    }
    startTransition(async () => {
      const result = await togglePhysicalTagInterestAction(petPublicToken);
      if ("error" in result) {
        setInterested(!optimisticNext);
        setRequestedAt(initialRequestedAt);
        setError(result.error);
        return;
      }
      const nowInterested = result.state === "interested";
      setInterested(nowInterested);
      if (nowInterested && !requestedAt) {
        setRequestedAt(new Date());
      }
    });
  }

  return (
    <section
      aria-labelledby="pp-physical-tag-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span aria-hidden="true">🏷️</span>
        <h2 id="pp-physical-tag-h" className="text-base font-semibold text-ln-ink ">
          {interested ? "Chapa física — anotado" : `¿Querés una chapa física para ${petName}?`}
        </h2>
      </div>

      {interested ? (
        <>
          <p className="text-sm text-ln-ink-2 ">
            Te avisamos cuando estén disponibles para {petName}.
            {requestedAt ? ` Solicitado el ${DATE_FMT.format(requestedAt)}.` : null}
          </p>
          <button
            type="button"
            onClick={onToggle}
            disabled={pending}
            className="mt-3 rounded-md border border-ln-line-strong px-3 py-1.5 text-xs font-medium text-ln-ink-2 hover:bg-ln-stripe disabled:opacity-50   "
          >
            {pending ? "Actualizando…" : "Cancelar interés"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-ln-ink-2 ">
            Una chapita con el QR de {petName} que cuelga del collar. Si alguien la encuentra,
            escanea y ve su libreta.
          </p>
          <p className="mt-2 text-xs text-ln-mute ">
            Estamos midiendo interés — no se cobra todavía.
          </p>
          <button
            type="button"
            onClick={onToggle}
            disabled={pending}
            className="mt-3 rounded-md bg-ln-azul px-3 py-1.5 text-xs font-medium text-white hover:bg-ln-azul-700 disabled:opacity-50   "
          >
            {pending ? "Guardando…" : "Me interesa"}
          </button>
        </>
      )}

      {error ? (
        <p className="mt-2 text-xs text-ln-err " role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
