// CredentialFace — Face 1 of the pet profile's two-face redesign (server).
// Spec: docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md
// Design: ADR-2. Fuses LnHero (identity) + printed QR (via the hero's actions
// slot) + the compliance stamp row + compact ppp/service-dog credential rows
// into ONE credential object.
//
// H1 (provenance gate): the stamp row is ComplianceObligationsPanel,
// re-hosted verbatim — its `tone: "ok"` only ever comes from
// deriveComplianceState, which requires a professional/institutional-verified
// event. This component does not derive compliance itself.
//
// Org-path viewers receive the exact same read-only object — no Anotar / no
// ⋯ Más live here; those belong to the caller's action row (page.tsx). The
// Emergencia card (vet/emergency contacts) is owner-only: the caller only
// passes `emergencyContacts` on the owner access path (page.tsx never fetches
// that profile data for org viewers).

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { ComplianceObligationsPanel } from "@/components/pet-profile/ComplianceObligationsPanel";
import { SheetTriggerLink } from "@/components/pet-profile/SheetTriggerLink";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnHero, type LnHeroProps } from "@/components/ui/Hero";
import type { ComplianceState } from "@/lib/projections/pet-compliance";

export type CredentialFacePppInfo = {
  attested: boolean;
  registerHref: string;
};

export type CredentialFaceServiceDogInfo = {
  serviceTypeLabel: string;
  manageHref: string;
  presentHref: string;
};

export type CredentialFaceEmergencyContacts = {
  preferredVetPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/**
 * In-Memoriam skin data (pet-document-redesign ADR-15). Passed only when
 * `pet.status === 'deceased'` — its presence IS the memorial-mode switch.
 */
export type CredentialFaceMemorial = {
  birthYear: number | null;
  deathYear: number | null;
};

export type CredentialFaceProps = {
  /** Everything LnHero needs except `actions` — the QR is injected here. */
  heroProps: Omit<LnHeroProps, "actions">;
  complianceState: ComplianceState;
  /** Pre-rendered QR SVG markup (from `qrcode`'s `toString({ type: "svg" })`). */
  qrSvg: string;
  /** Public credential page URL. E.g. /p/{token} */
  publicHref: string;
  /** Rendered only when the jurisdiction PPP rule applies. */
  ppp?: CredentialFacePppInfo | null;
  /** Rendered only for a vigente, in-service registered service dog. */
  serviceDog?: CredentialFaceServiceDogInfo | null;
  /**
   * Owner-only vet/emergency contact rows. `null`/`undefined` (org viewers,
   * or a fetch that yielded no profile row) renders no Emergencia card at
   * all — pass an object (even with every field `null`) to show the "Agregar
   * datos de emergencia" prompt for an owner who hasn't filled these in yet.
   */
  emergencyContacts?: CredentialFaceEmergencyContacts | null;
  petPublicToken: string;
  /** In-Memoriam skin (ADR-15) — sepia tone + ribbon + deceased-date line. */
  memorial?: CredentialFaceMemorial | null;
};

export function CredentialFace({
  heroProps,
  complianceState,
  qrSvg,
  publicHref,
  ppp,
  serviceDog,
  emergencyContacts,
  petPublicToken,
  memorial,
}: CredentialFaceProps) {
  const memorialDateLine = memorial
    ? memorial.birthYear && memorial.deathYear
      ? `En memoria · ${memorial.birthYear}–${memorial.deathYear}`
      : "En memoria"
    : null;

  return (
    <div
      className="flex flex-col gap-4"
      style={memorial ? { filter: "grayscale(0.35) sepia(0.2)" } : undefined}
    >
      {memorial && (
        <div
          data-section="memorial-ribbon"
          className="rounded-[var(--radius-sm)] border px-3.5 py-2 text-center"
          style={{
            background: "var(--color-ln-memorial-chip-bg)",
            borderColor: "var(--color-ln-memorial-chip-bd)",
            color: "var(--color-ln-memorial-chip-text)",
          }}
        >
          <p className="m-0 font-[var(--font-ln-serif)] text-sm font-semibold italic">
            In Memoriam{memorialDateLine ? ` · ${memorialDateLine}` : ""}
          </p>
        </div>
      )}

      <LnHero
        {...heroProps}
        actions={
          // Single QR entry point (spec "Single source per datum") — tapping
          // it navigates straight to the public credential; no in-page reveal.
          <Link href={publicHref} aria-label="Ver credencial pública" className="block">
            <div
              className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-white p-1 [&_svg]:h-16 [&_svg]:w-16"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated QR SVG from the qrcode package, no user input.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </Link>
        }
      />

      {complianceState.cards.length > 0 && (
        <ComplianceObligationsPanel state={complianceState} petPublicToken={petPublicToken} />
      )}

      {emergencyContacts && (
        <EmergencyCard contacts={emergencyContacts} petPublicToken={petPublicToken} />
      )}

      {(ppp || serviceDog) && (
        <div data-section="credentials" className="flex flex-col gap-2">
          {ppp && (
            <div
              data-section="ppp-row"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-3.5 py-2.5 text-sm"
            >
              <span className="text-[var(--color-ln-warn)]">
                ⚠ Animal Potencialmente Peligroso
                {ppp.attested ? " · Atestada" : " · Atestación pendiente"}
              </span>
              {!ppp.attested && (
                <Link
                  href={ppp.registerHref}
                  className="shrink-0 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] text-[var(--color-ln-warn)] no-underline hover:underline"
                >
                  Registrar →
                </Link>
              )}
            </div>
          )}
          {serviceDog && (
            <div
              data-section="service-dog-row"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-3.5 py-2.5 text-sm"
            >
              <span className="text-[var(--color-ln-ok)]">
                🦮 Perro de asistencia · {serviceDog.serviceTypeLabel}
              </span>
              <span className="flex shrink-0 gap-3">
                <Link
                  href={serviceDog.manageHref}
                  className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] text-[var(--color-ln-ok)] no-underline hover:underline"
                >
                  Gestionar →
                </Link>
                <Link
                  href={serviceDog.presentHref}
                  className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] text-[var(--color-ln-ok)] no-underline hover:underline"
                >
                  Presentar →
                </Link>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmergencyCard — vet + emergency contact, tap-to-call. Owner-only (see
// CredentialFaceProps.emergencyContacts). Shows a quiet "Agregar datos de
// emergencia" prompt when any of the three source fields is missing.
// ---------------------------------------------------------------------------

function EmergencyCard({
  contacts,
  petPublicToken,
}: {
  contacts: CredentialFaceEmergencyContacts;
  petPublicToken: string;
}) {
  const { preferredVetPhone, emergencyContactName, emergencyContactPhone } = contacts;
  const hasAnyContact = Boolean(preferredVetPhone || emergencyContactPhone);
  const isMissingSomething = !preferredVetPhone || !emergencyContactName || !emergencyContactPhone;
  // pet-document-redesign ADR-13 (Phase 5): the edit entry point moved from
  // the full /cuenta/editar page (with a #emergencia scroll anchor) to the
  // narrow in-profile `?sheet=emergencia` sheet — same destination for both
  // the "add" prompt (missing data) and the "edit" affordance (has data).
  const editHref = `/mis-mascotas/${petPublicToken}?sheet=emergencia`;

  return (
    <LnCard>
      <LnCardHead title="Emergencia" />
      <LnCardBody>
        {hasAnyContact && (
          <div className="divide-y divide-[var(--color-ln-line-2)]">
            {preferredVetPhone && (
              <a
                href={`tel:${preferredVetPhone}`}
                className="flex items-center justify-between gap-3 py-2.5 text-sm no-underline first:pt-0 last:pb-0"
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
                className="flex items-center justify-between gap-3 py-2.5 text-sm no-underline first:pt-0 last:pb-0"
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
            hasAnyContact ? "mt-2.5" : "",
          ].join(" ")}
        >
          {isMissingSomething ? "Agregar datos de emergencia →" : "Editar →"}
        </SheetTriggerLink>
      </LnCardBody>
    </LnCard>
  );
}
