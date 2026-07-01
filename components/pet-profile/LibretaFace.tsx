"use client";

// LibretaFace — Face 2 of the pet profile's two-face redesign (client).
// Design: ADR-3. Owns the lens state; renders lens chips, the PRÓXIMO future
// ledger, a "— hoy —" divider, then past events (reusing EventTimelineList so
// H3 curated detail + provenance/amendment badges render verbatim). Under the
// `vacunas` lens also shows the 3-badge vaccination summary; the immutability
// note and export/share footer close the face.

import Link from "next/link";
import { useState } from "react";

import { EventTimelineList } from "@/app/(app)/mis-mascotas/[publicToken]/EventTimeline";
import { SharesManager } from "@/app/(app)/mis-mascotas/[publicToken]/libreta/SharesManager";
import { ExportLibretaButton } from "@/components/pet-profile/ExportLibretaButton";
import { FutureLedgerList } from "@/components/pet-profile/FutureLedgerList";
import { VacunasStatusBadges } from "@/components/pet-profile/VacunasStatusBadges";
import type { LibretaFaceData } from "@/src/modules/pets/application/tab-data/types";
import { type LibretaLens, futureItemMatchesLens, pastEventMatchesLens } from "./libreta-lens";

const LENS_LABELS: Record<LibretaLens, string> = {
  todo: "Todo",
  vacunas: "Vacunas",
  oficial: "Oficial",
};

const LENSES: LibretaLens[] = ["todo", "vacunas", "oficial"];

type Props = {
  data: LibretaFaceData;
  petPublicToken: string;
  /** Lens resolved server-side from resolvePetFace (URL is the source of truth). */
  initialLens: LibretaLens;
  /** Org-path viewers never see `todo` — the chip is not rendered for them. */
  isOwner: boolean;
};

export function LibretaFace({ data, petPublicToken, initialLens, isOwner }: Props) {
  // Defensive clamp — resolvePetFace already clamps org viewers server-side,
  // but this guards direct callers/future callers from ever mounting an org
  // viewer on the `todo` lens.
  const [lens, setLens] = useState<LibretaLens>(() =>
    !isOwner && initialLens === "todo" ? "vacunas" : initialLens,
  );

  const visibleLenses = isOwner ? LENSES : LENSES.filter((l) => l !== "todo");

  const future = data.future.filter((item) => futureItemMatchesLens(item, lens));
  const past = data.past.filter((row) => pastEventMatchesLens(row.eventType, lens));

  const isEmpty = future.length === 0 && past.length === 0;

  const chipClass = (selected: boolean) =>
    selected
      ? "px-3 py-1 rounded-full text-xs font-medium transition-colors bg-[var(--color-ln-azul)] text-white"
      : "px-3 py-1 rounded-full text-xs font-medium transition-colors border border-[var(--color-ln-line)] text-[var(--color-ln-ink-2)] hover:bg-[var(--color-ln-stripe)]";

  return (
    <div className="space-y-5 py-5">
      {/* Lens chips — REPLACE EventTimeline's per-type chip bar (ADR-3). */}
      <div className="flex flex-wrap gap-2">
        {visibleLenses.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLens(l)}
            aria-pressed={lens === l}
            className={chipClass(lens === l)}
          >
            {LENS_LABELS[l]}
          </button>
        ))}
      </div>

      {lens === "vacunas" && <VacunasStatusBadges summary={data.summary} />}

      {isEmpty ? (
        <p className="text-sm text-[var(--color-ln-mute)]">
          Sin eventos ni cuidados programados para esta lente todavía.
        </p>
      ) : (
        <>
          <FutureLedgerList items={future} petPublicToken={petPublicToken} />

          {future.length > 0 && past.length > 0 && (
            <div className="flex items-center gap-3 text-xs uppercase tracking-[.06em] text-[var(--color-ln-faint)]">
              <span className="h-px flex-1 bg-[var(--color-ln-line)]" />— hoy —
              <span className="h-px flex-1 bg-[var(--color-ln-line)]" />
            </div>
          )}

          <EventTimelineList events={past} publicToken={petPublicToken} />
        </>
      )}

      {/* Immutability, in plain es-AR (append-only ledger — WS-3). */}
      <p className="text-xs text-[var(--color-ln-mute)]">
        Los eventos no se editan ni se borran. Una corrección es un evento nuevo.
      </p>

      {isOwner && <SharesManager petPublicToken={petPublicToken} shares={data.activeShares} />}

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-ln-line-2)] pt-3.5 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
        <span>Asientos firmados digitalmente · inmutables</span>
        <ExportLibretaButton petPublicToken={petPublicToken} />
        <Link
          href={`/mis-mascotas/${petPublicToken}?sheet=compartir`}
          className="text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          Compartir libreta
        </Link>
      </footer>
    </div>
  );
}
