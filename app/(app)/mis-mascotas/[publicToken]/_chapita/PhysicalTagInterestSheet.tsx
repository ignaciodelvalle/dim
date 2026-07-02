"use client";

// PhysicalTagInterestSheet — hosts the physical-tag-interest flow inside the
// pet profile's `?sheet=chapita` (pet-document-redesign ADR-17b, REQ-11.2).
//
// The physical-tag BACKEND survived the achievements/orphaned-UI cleanup
// intact — togglePhysicalTagInterestAction (write, owner-gated at the action
// layer) and getPhysicalTagInterest (read) were never deleted, only their
// standalone card (components/pet-profile/PhysicalTagInterestCard.tsx,
// removed by the two-face redesign). This is the same optimistic-UI logic,
// reshaped to render as a sheet body instead of a standalone card.

import { useState, useTransition } from "react";

import { togglePhysicalTagInterestAction } from "@/app/actions/physical-tag-interest";

type Props = {
  petPublicToken: string;
  petName: string;
  initialInterested: boolean;
  initialRequestedAt: Date | null;
};

const DATE_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function PhysicalTagInterestSheet({
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
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span aria-hidden="true">🏷️</span>
        <h2 className="text-base font-semibold text-[var(--color-ln-ink)]">
          {interested ? "Chapa física — anotado" : `¿Querés una chapa física para ${petName}?`}
        </h2>
      </div>

      {interested ? (
        <p className="text-sm text-[var(--color-ln-ink-2)]">
          Te avisamos cuando estén disponibles para {petName}.
          {requestedAt ? ` Solicitado el ${DATE_FMT.format(requestedAt)}.` : null}
        </p>
      ) : (
        <>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            Una chapita con el QR de {petName} que cuelga del collar. Si alguien la encuentra,
            escanea y ve su libreta.
          </p>
          <p className="text-xs text-[var(--color-ln-mute)]">
            Estamos midiendo interés — no se cobra todavía.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className={
          interested
            ? "min-h-11 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] px-4 text-sm font-medium text-[var(--color-ln-ink-2)] transition-colors hover:bg-[var(--color-ln-stripe)] disabled:opacity-50"
            : "min-h-11 rounded-[var(--radius-sm)] bg-[var(--color-ln-azul)] px-4 text-sm font-medium text-white transition-colors hover:bg-ln-azul-700 disabled:opacity-50"
        }
      >
        {pending ? "Guardando…" : interested ? "Cancelar interés" : "Me interesa"}
      </button>

      {error && (
        <p className="text-xs text-[var(--color-ln-err)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
