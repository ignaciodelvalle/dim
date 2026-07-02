"use client";

// LibretaFace — Face 2 of the pet profile's two-face redesign (client).
// pet-document-redesign ADR-10: ONE consolidated timeline, no lens chips.
// Owners see everything; org/vet viewers see only the libreta-sanitaria
// whitelist (the audience predicate — see libreta-lens.ts). Renders the
// PRÓXIMO future ledger, a "— hoy —" divider, then past events (reusing
// EventTimelineList so H3 curated detail + provenance/amendment badges
// render verbatim). VacunasStatusBadges is always on (ADR-10). Share
// management moved out entirely (ADR-14) — see MergedShareSheet
// (`?sheet=compartir`); this face keeps the immutability note, a compact
// owner-only Emergencia block (wave-3 P3, PO decision #645 point 3 — moved
// off CredentialFace), and the keepsake ExportLibretaButton in its footer.

import { EventTimelineList } from "@/app/(app)/mis-mascotas/[publicToken]/EventTimeline";
import { Icon } from "@/components/Icon";
import { ExportLibretaButton } from "@/components/pet-profile/ExportLibretaButton";
import { FutureLedgerList } from "@/components/pet-profile/FutureLedgerList";
import { SheetTriggerLink } from "@/components/pet-profile/SheetTriggerLink";
import { VacunasStatusBadges } from "@/components/pet-profile/VacunasStatusBadges";
import type { LibretaFaceData } from "@/src/modules/pets/application/tab-data/types";
import { pastEventMatchesAudience } from "./libreta-lens";

export type LibretaFaceEmergencyContacts = {
  preferredVetPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

type Props = {
  data: LibretaFaceData;
  petPublicToken: string;
  /**
   * Owners see the full consolidated timeline; org/vet viewers see only the
   * libreta-sanitaria-relevant subset (ADR-10). No user-facing toggle.
   */
  isOwner: boolean;
  /**
   * Owner-only vet/emergency contact rows. `null`/`undefined` (org viewers,
   * or a fetch that yielded no profile row) renders no Emergencia block at
   * all — pass an object (even with every field `null`) to show the "Agregar
   * datos de emergencia" prompt for an owner who hasn't filled these in yet.
   */
  emergencyContacts?: LibretaFaceEmergencyContacts | null;
};

export function LibretaFace({ data, petPublicToken, isOwner, emergencyContacts }: Props) {
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

      {emergencyContacts && (
        <EmergenciaBlock contacts={emergencyContacts} petPublicToken={petPublicToken} />
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

// ---------------------------------------------------------------------------
// EmergenciaBlock — compact vet + emergency contact info, tap-to-call.
// Owner-only (see Props.emergencyContacts). Shows a quiet "Agregar datos de
// emergencia" prompt when any of the three source fields is missing.
// ---------------------------------------------------------------------------

function EmergenciaBlock({
  contacts,
  petPublicToken,
}: {
  contacts: LibretaFaceEmergencyContacts;
  petPublicToken: string;
}) {
  const { preferredVetPhone, emergencyContactName, emergencyContactPhone } = contacts;
  const hasAnyContact = Boolean(preferredVetPhone || emergencyContactPhone);
  const isMissingSomething = !preferredVetPhone || !emergencyContactName || !emergencyContactPhone;
  // pet-document-redesign ADR-13 (Phase 5): the edit entry point is the
  // narrow in-profile `?sheet=emergencia` sheet — same destination for both
  // the "add" prompt (missing data) and the "edit" affordance (has data).
  const editHref = `/mis-mascotas/${petPublicToken}?sheet=emergencia`;

  return (
    <div
      data-section="libreta-emergencia"
      className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-3.5 py-3"
    >
      <p className="mb-1.5 font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-faint)]">
        Emergencia
      </p>
      {hasAnyContact && (
        <div className="divide-y divide-[var(--color-ln-line-2)]">
          {preferredVetPhone && (
            <a
              href={`tel:${preferredVetPhone}`}
              className="flex items-center justify-between gap-3 py-2 text-sm no-underline first:pt-0 last:pb-0"
            >
              <span className="text-[var(--color-ln-mute)]">Veterinario</span>
              <span className="flex items-center gap-1.5 font-medium text-[var(--color-ln-azul)]">
                <Icon name="telefono" size="sm" decorative />
                {preferredVetPhone}
              </span>
            </a>
          )}
          {emergencyContactPhone && (
            <a
              href={`tel:${emergencyContactPhone}`}
              className="flex items-center justify-between gap-3 py-2 text-sm no-underline first:pt-0 last:pb-0"
            >
              <span className="text-[var(--color-ln-mute)]">
                {emergencyContactName ?? "Contacto de emergencia"}
              </span>
              <span className="flex items-center gap-1.5 font-medium text-[var(--color-ln-azul)]">
                <Icon name="telefono" size="sm" decorative />
                {emergencyContactPhone}
              </span>
            </a>
          )}
        </div>
      )}
      <SheetTriggerLink
        href={editHref}
        className={[
          "inline-block text-xs text-[var(--color-ln-mute)] no-underline hover:underline",
          hasAnyContact ? "mt-2" : "",
        ].join(" ")}
      >
        {isMissingSomething ? "Agregar datos de emergencia →" : "Editar →"}
      </SheetTriggerLink>
    </div>
  );
}
