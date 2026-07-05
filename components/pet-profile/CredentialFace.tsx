// CredentialFace — the FRONT of the pet profile's one-document credential
// ("Una sola libreta" redesign; server component). Everything below the blue
// band (which DocumentChrome renders around this face) lives here as one framed
// sheet, bound by labeled hairline dividers so it reads as a single credential
// rather than a stack of panels:
//
//   Identity row (photo overlapping the band · name + "Registrada" badge ·
//     "Macho · Perro" · location chip · public-credential QR)
//   — Cumplimiento —  ComplianceObligationsPanel (bare) + ppp/service-dog rows
//   — Avisos —        the prioritized alert strip (only when non-empty)
//   — Anotar —        the embedded free-text capture (owner + active only)
//   — (actions) —     the icon action row
//
// H1 (provenance gate): the compliance grid is ComplianceObligationsPanel,
// re-hosted verbatim — its `tone: "ok"` only ever comes from
// deriveComplianceState, which requires a professional/institutional-verified
// event. This component does not derive compliance itself.
//
// Org-path viewers receive the exact same read-only object — the caller passes
// `anotar={null}` and an org-scoped `actions` node (no capture, no ⋯ Más), so
// this face never grows an owner-only affordance on its own.

import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/Icon";
import { ComplianceObligationsPanel } from "@/components/pet-profile/ComplianceObligationsPanel";
import { LnAlert } from "@/components/ui/Alert";
import type { LnHeroProps } from "@/components/ui/Hero";
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
  /** Identity data — same shape the hero used (name/breed/photo/tags/status). */
  heroProps: Omit<LnHeroProps, "actions">;
  complianceState: ComplianceState;
  /** Pre-rendered QR SVG markup (from `qrcode`'s `toString({ type: "svg" })`). */
  qrSvg: string;
  /** Public credential page URL. E.g. /p/{token} */
  publicHref: string;
  /** Rendered only when the jurisdiction PPP rule applies. */
  /** Rendered only for a vigente, in-service registered service dog. */
  serviceDog?: CredentialFaceServiceDogInfo | null;
  petPublicToken: string;
  /** In-Memoriam skin (ADR-15) — sepia tone + ribbon + deceased-date line. */
  memorial?: CredentialFaceMemorial | null;
  /** Prioritized alert strip node. `null`/absent → no "Avisos" section. */
  avisos?: ReactNode;
  /** Embedded capture node (EventCatcherSingle). `null`/absent → no "Anotar" section. */
  anotar?: ReactNode;
  /** Action row node (PetActionRow). Always rendered as the sheet footer. */
  actions?: ReactNode;
};

export function CredentialFace({
  heroProps,
  complianceState,
  qrSvg,
  publicHref,
  serviceDog,
  petPublicToken,
  memorial,
  avisos,
  anotar,
  actions,
}: CredentialFaceProps) {
  const memorialYearRange =
    memorial?.birthYear && memorial?.deathYear
      ? `${memorial.birthYear}–${memorial.deathYear}`
      : null;

  const publicLabel = publicHref.replace(/^\//, "");

  return (
    <div style={memorial ? { filter: "grayscale(0.35) sepia(0.2)" } : undefined}>
      {memorial && (
        <div data-section="memorial-ribbon" className="flex justify-center pt-4">
          <LnMemorialChip>
            En memoria{memorialYearRange ? ` · ${memorialYearRange}` : ""}
          </LnMemorialChip>
        </div>
      )}

      {/* Identity row — the photo pokes up into the band (negative margin). */}
      <div className="ln-sec">
        <div className="ln-idrow">
          <div className="ln-photo">
            {heroProps.photoSrc ? (
              <img src={heroProps.photoSrc} alt={heroProps.name} />
            ) : (
              <span className="ln-photo-empty">
                <Icon name="paw" size="lg" decorative />
              </span>
            )}
          </div>

          <div className="ln-idmeta">
            <h1 className="ln-idname">
              {heroProps.name}
              <span className="ln-badge-reg">
                <Icon name="check" size="sm" decorative />
                Inscripta
              </span>
            </h1>
            {heroProps.breed && <div className="ln-idsub">{heroProps.breed}</div>}
            {heroProps.tags && heroProps.tags.length > 0 && (
              <div className="ln-chips">
                {heroProps.tags.map((tag) => (
                  <span key={tag.key} className="ln-chip">
                    {tag.key === "loc" && <Icon name="map-pin" size="sm" decorative />}
                    {tag.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="ln-qr">
            <Link
              href={publicHref}
              aria-label="Ver credencial pública"
              className="ln-qr-link no-underline"
            >
              <span
                className="ln-qr-frame"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: server-generated QR SVG from the qrcode package, no user input.
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </Link>
            <div className="ln-qr-cap">
              <b>Credencial pública</b>
              {publicLabel}
            </div>
          </div>
        </div>
      </div>

      {/* Cumplimiento — the provenance-gated obligation grid, bare (the divider
          labels it; no card-in-card outer box). */}
      {complianceState.cards.length > 0 && (
        <>
          <div className="ln-divider">
            <span className="ln-divider-label">
              <Icon name="shield" size="sm" decorative />
              Cumplimiento
            </span>
          </div>
          <div className="ln-sec">
            <ComplianceObligationsPanel
              state={complianceState}
              petPublicToken={petPublicToken}
              bare
            />

            {/* PPP is surfaced ONCE — as the canonical compliance obligation
                card above (derivePpp + its "Registrar atestación" action). The
                old duplicate PPP alert row was removed. Only the service-dog
                credential row lives here now. */}
            {serviceDog && (
              <div data-section="credentials" className="mt-3 flex flex-col gap-2">
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
              </div>
            )}
          </div>
        </>
      )}

      {/* Avisos — only when the strip carries at least one alert (the caller
          passes null when empty, so no empty divider appears). */}
      {avisos && (
        <>
          <div className="ln-divider">
            <span className="ln-divider-label">
              <Icon name="alert" size="sm" decorative />
              Avisos
            </span>
          </div>
          <div className="ln-sec">{avisos}</div>
        </>
      )}

      {/* Anotar — embedded free-text capture (owner + active only). */}
      {anotar && (
        <>
          <div className="ln-divider">
            <span className="ln-divider-label">
              <Icon name="edit" size="sm" decorative />
              Anotar
            </span>
          </div>
          <div className="ln-sec">{anotar}</div>
        </>
      )}

      {/* Action row — the sheet footer. */}
      {actions && (
        <>
          <div className="ln-divider" />
          <div className="ln-sec">{actions}</div>
        </>
      )}
    </div>
  );
}
