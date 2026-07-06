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

import { Icon } from "@/components/Icon";
import { AsientoCard } from "@/components/pet-profile/AsientoCard";
import { ExportLibretaButton } from "@/components/pet-profile/ExportLibretaButton";
import { FutureLedgerList } from "@/components/pet-profile/FutureLedgerList";
import { SheetTriggerLink } from "@/components/pet-profile/SheetTriggerLink";
import { VacunasStatusBadges } from "@/components/pet-profile/VacunasStatusBadges";
import { speciesLabel } from "@/lib/utils/format";
import type { LibretaFaceData } from "@/src/modules/pets/application/tab-data/types";
import { useState } from "react";
import { toAsientoView } from "./asiento-fields";
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
  // Compute `now` ONCE at mount and thread the SAME value into every relative
  // renderer (toAsientoView → formatRelative). A bare `const now = new Date()`
  // recomputes on every re-render (e.g. a ?tab= change re-renders this face),
  // so a card sitting on a day boundary could silently flip "hace 2 días" →
  // "hace 3 días" between renders. Freezing it with a lazy useState makes the
  // face's relative labels deterministic for the mount's lifetime and keeps
  // the initial render pure (the F1 `now`-subclass residual: the initial tree
  // must not depend on a value that drifts between renders). The absolute
  // dates are already tz-pinned (AR_TIME_ZONE) for the sibling #418 subclass.
  const [now] = useState(() => new Date());
  const speciesLine = [
    speciesLabel(data.identity.species),
    data.identity.sex === "male" ? "macho" : data.identity.sex === "female" ? "hembra" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="ln-sec">
      {/* Libreta head — the ledger's masthead. */}
      <div className="ln-lib-head">
        <h2>{data.identity.name}</h2>
        <span className="ln-lib-code">{data.identity.publicToken}</span>
        {speciesLine && <span className="ln-lib-titular">{speciesLine}</span>}
      </div>

      <div className="mt-4">
        <VacunasStatusBadges summary={data.summary} />
      </div>

      {isEmpty ? (
        <p className="mt-5 text-sm text-[var(--color-ln-mute)]">
          Sin eventos ni cuidados programados todavía.
        </p>
      ) : (
        <>
          {future.length > 0 && (
            <div className="mt-1">
              <FutureLedgerList items={future} petPublicToken={petPublicToken} />
            </div>
          )}

          {future.length > 0 && past.length > 0 && (
            // Directional "hoy" divider: a bare "— hoy —" read as a date tag for
            // the future item directly above it (QA round 2 2026-07-03 #7: a
            // 2027 reminder appeared labeled "HOY"). Arrows disambiguate which
            // side is upcoming and which is history.
            <div className="ln-hoy">próximo ↑ · hoy · historia ↓</div>
          )}

          {past.length > 0 && (
            <>
              <div className="ln-ledlbl">
                Asientos · {past.length} {past.length === 1 ? "registro" : "registros"}
              </div>
              <div className="ln-asientos">
                {past.map((row) => (
                  <AsientoCard
                    key={row.id}
                    view={toAsientoView(row, petPublicToken, now)}
                    eventHref={`/mis-mascotas/${petPublicToken}/eventos/${row.id}`}
                    // A weight asiento's sparkline shows the TRAILING 12-MONTH
                    // curve ending at its own date — every weigh-in in the year
                    // before this record (chronological), not just prev+current,
                    // and never future weigh-ins the owner logged later (a past
                    // record must not depend on data that didn't exist yet).
                    weightSamples={
                      row.eventType === "weight_recorded"
                        ? data.weightSamples.filter((s) => {
                            const t = s.date.getTime();
                            const end = new Date(row.occurredAt).getTime();
                            return t <= end && t >= end - 365 * 86_400_000;
                          })
                        : undefined
                    }
                  />
                ))}
              </div>
            </>
          )}

          {data.pastTruncated && (
            // perf/scale review 2026-07-04 — `past` is bounded (PAST_EVENTS_WINDOW)
            // for long-lived pets; this note keeps that cap honest instead of
            // silently hiding older history.
            <p className="mt-3 text-xs text-[var(--color-ln-mute)]">
              Mostrando los eventos más recientes. Imprimí la libreta completa para ver todo el
              historial.
            </p>
          )}
        </>
      )}

      {emergencyContacts && (
        <div className="mt-5">
          <EmergenciaBlock contacts={emergencyContacts} petPublicToken={petPublicToken} />
        </div>
      )}

      {/* Immutability, in plain es-AR (append-only ledger — WS-3). */}
      <p className="ln-immut">
        <Icon name="lock" size="sm" decorative />
        <span>Los eventos no se editan ni se borran. Una corrección es un evento nuevo.</span>
      </p>

      <footer className="ln-libfoot font-[var(--font-ln-mono)] text-xs uppercase tracking-[.04em] text-[var(--color-ln-faint)]">
        <span>Asientos firmados digitalmente · inmutables</span>
        <span className="ln-fspace" />
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
    // Borderless, hairline-topped section (not a nested box) so it coheres with
    // the rest of the ledger inside the certificate sheet.
    <div
      data-section="libreta-emergencia"
      className="border-t border-[var(--color-ln-line-2)] pt-4"
    >
      <p className="mb-1.5 font-[var(--font-ln-mono)] text-[var(--text-sm)] uppercase tracking-[.06em] text-[var(--color-ln-faint)]">
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
