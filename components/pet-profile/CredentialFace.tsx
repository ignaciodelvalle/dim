// CredentialFace — Face 1 of the pet profile's two-face redesign (server).
// Spec: docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md
// Design: ADR-2. Fuses LnHero (identity) + printed QR (via the hero's actions
// slot) + the compliance stamp row + mono ID lines + seal + compact
// ppp/service-dog credential rows into ONE credential object.
//
// H1 (provenance gate): the stamp row is ComplianceObligationsPanel,
// re-hosted verbatim — its `tone: "ok"` only ever comes from
// deriveComplianceState, which requires a professional/institutional-verified
// event. This component does not derive compliance itself.
//
// Org-path viewers receive the exact same read-only object — no Anotar / no
// ⋯ Más live here; those belong to the caller's action row (page.tsx).

import Image from "next/image";
import Link from "next/link";

import { ComplianceObligationsPanel } from "@/components/pet-profile/ComplianceObligationsPanel";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSeal } from "@/components/ui/DocElements";
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

export type CredentialFaceProps = {
  /** Everything LnHero needs except `actions` — the QR is injected here. */
  heroProps: Omit<LnHeroProps, "actions">;
  complianceState: ComplianceState;
  identity: {
    microchip: string | null;
    /** e.g. LIB-AR-{publicToken} */
    libretaId: string;
    titular: string | null;
  };
  /** Pre-built QR image URL. E.g. /p/{token}.png */
  qrUrl: string;
  /** Public credential page URL. E.g. /p/{token} */
  publicHref: string;
  /** Rendered only when the jurisdiction PPP rule applies. */
  ppp?: CredentialFacePppInfo | null;
  /** Rendered only for a vigente, in-service registered service dog. */
  serviceDog?: CredentialFaceServiceDogInfo | null;
  petPublicToken: string;
};

export function CredentialFace({
  heroProps,
  complianceState,
  identity,
  qrUrl,
  publicHref,
  ppp,
  serviceDog,
  petPublicToken,
}: CredentialFaceProps) {
  return (
    <div className="flex flex-col gap-4">
      <LnHero
        {...heroProps}
        actions={
          // Single QR entry point (spec "Single source per datum") — tapping
          // it navigates straight to the public credential; no in-page reveal.
          <Link href={publicHref} aria-label="Ver credencial pública" className="block">
            <Image
              src={qrUrl}
              alt="Código QR de la credencial pública"
              width={64}
              height={64}
              className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-white p-1"
              unoptimized
            />
          </Link>
        }
      />

      {complianceState.cards.length > 0 && (
        <ComplianceObligationsPanel state={complianceState} petPublicToken={petPublicToken} />
      )}

      <LnCard>
        <LnCardHead title="Identificación" />
        <LnCardBody>
          <div className="space-y-2.5 font-[var(--font-ln-mono)] text-sm leading-[1.9]">
            {identity.microchip && (
              <>
                <p className="text-[var(--color-ln-mute)]">MICROCHIP</p>
                <p className="mb-1.5 text-[var(--color-ln-ink)]">{identity.microchip}</p>
              </>
            )}
            <p className="text-[var(--color-ln-mute)]">LIBRETA</p>
            <p className="mb-1.5 text-[var(--color-ln-ink)]">{identity.libretaId}</p>
            {identity.titular && (
              <>
                <p className="text-[var(--color-ln-mute)]">TITULAR</p>
                <p className="text-[var(--color-ln-ink)]">{identity.titular}</p>
              </>
            )}
          </div>
        </LnCardBody>
      </LnCard>

      <LnCard>
        <div className="flex items-center gap-3.5 px-4 py-3.5">
          <LnSeal line1="Registro" line2="Nacional" size={52} />
          <div>
            <p className="font-[var(--font-ln-serif)] text-sm font-semibold text-[var(--color-ln-ink)]">
              Inscripción válida
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-ln-mute)]">
              MiMAR · Registro Nacional de Mascotas
            </p>
          </div>
        </div>
      </LnCard>

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
