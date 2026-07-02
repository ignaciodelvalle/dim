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
// Emergencia card (vet/emergency contacts) moved to LibretaFace (wave-3 P3,
// PO decision #645 point 3) — this face no longer renders it.

import Link from "next/link";

import { ComplianceObligationsPanel } from "@/components/pet-profile/ComplianceObligationsPanel";
import { LnAlert } from "@/components/ui/Alert";
import { LnHero, type LnHeroProps } from "@/components/ui/Hero";
import { LnMemorialChip } from "@/components/ui/StatusFlag";
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
  petPublicToken,
  memorial,
}: CredentialFaceProps) {
  // wave-3 D12 (design-system audit finding 6): the ribbon used to hand-roll
  // its own box using the exact same 3 --color-ln-memorial-chip-* tokens
  // LnMemorialChip already wraps up — it's the canonical memorial-state
  // treatment (StatusFlag.tsx) and had zero consumers. Route through it
  // instead of reinventing the same colors/shape a second time.
  const memorialYearRange =
    memorial?.birthYear && memorial?.deathYear
      ? `${memorial.birthYear}–${memorial.deathYear}`
      : null;

  return (
    <div
      className="flex flex-col gap-4"
      style={memorial ? { filter: "grayscale(0.35) sepia(0.2)" } : undefined}
    >
      {memorial && (
        <div data-section="memorial-ribbon" className="flex justify-center">
          <LnMemorialChip>
            En memoria{memorialYearRange ? ` · ${memorialYearRange}` : ""}
          </LnMemorialChip>
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

      {(ppp || serviceDog) && (
        <div data-section="credentials" className="flex flex-col gap-2">
          {ppp && (
            <div data-section="ppp-row">
              <LnAlert variant="warning">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    Animal Potencialmente Peligroso
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
              </LnAlert>
            </div>
          )}
          {serviceDog && (
            <div data-section="service-dog-row">
              <LnAlert variant="success" icon="paw">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>Perro de asistencia · {serviceDog.serviceTypeLabel}</span>
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
              </LnAlert>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
