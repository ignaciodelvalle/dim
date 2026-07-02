"use client";

// LibretaFace — Face 2 of the pet profile's two-face redesign (client).
// pet-document-redesign ADR-10: ONE consolidated timeline, no lens chips.
// Owners see everything; org/vet viewers see only the libreta-sanitaria
// whitelist (the audience predicate — see libreta-lens.ts). Renders the
// PRÓXIMO future ledger, a "— hoy —" divider, then past events (reusing
// EventTimelineList so H3 curated detail + provenance/amendment badges
// render verbatim). VacunasStatusBadges is always on (ADR-10). Share
// management moved out entirely (ADR-14) — see MergedShareSheet
// (`?sheet=compartir`); this face keeps only the immutability note and the
// keepsake ExportLibretaButton in its footer.

import { EventTimelineList } from "@/app/(app)/mis-mascotas/[publicToken]/EventTimeline";
import { ExportLibretaButton } from "@/components/pet-profile/ExportLibretaButton";
import { FutureLedgerList } from "@/components/pet-profile/FutureLedgerList";
import { VacunasStatusBadges } from "@/components/pet-profile/VacunasStatusBadges";
import type { LibretaFaceData } from "@/src/modules/pets/application/tab-data/types";
import { pastEventMatchesAudience } from "./libreta-lens";

type Props = {
  data: LibretaFaceData;
  petPublicToken: string;
  /**
   * Owners see the full consolidated timeline; org/vet viewers see only the
   * libreta-sanitaria-relevant subset (ADR-10). No user-facing toggle.
   */
  isOwner: boolean;
};

export function LibretaFace({ data, petPublicToken, isOwner }: Props) {
  const audience = isOwner ? "owner" : "org";

  // Future items are never filtered by audience (matches the old lens
  // system's behavior for both "todo" and "oficial" — only the removed
  // "vacunas" lens filtered future items).
  const future = data.future;
  const past = data.past.filter((row) => pastEventMatchesAudience(row.eventType, audience));

  const isEmpty = future.length === 0 && past.length === 0;

  return (
    <div className="space-y-5 py-5">
      <VacunasStatusBadges summary={data.summary} />

      {isEmpty ? (
        <p className="text-sm text-[var(--color-ln-mute)]">
          Sin eventos ni cuidados programados todavía.
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

          <EventTimelineList
            events={past}
            publicToken={petPublicToken}
            weightSamples={data.weightSamples}
          />
        </>
      )}

      {/* Immutability, in plain es-AR (append-only ledger — WS-3). */}
      <p className="text-xs text-[var(--color-ln-mute)]">
        Los eventos no se editan ni se borran. Una corrección es un evento nuevo.
      </p>

      <footer className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--color-ln-line-2)] pt-3.5 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
        <span>Asientos firmados digitalmente · inmutables</span>
        <ExportLibretaButton petPublicToken={petPublicToken} />
      </footer>
    </div>
  );
}
