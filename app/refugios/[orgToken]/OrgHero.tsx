import Link from "next/link";

import { Badge } from "@/components/poncho/Badge";
import type { OrgPublicProfile } from "@/lib/org-public-profile";
import { orgLogoUrl } from "@/lib/storage";

// Hero del refugio público (handoff P2-2).
//
// Layout responsive:
//   - mobile (< md): logo 64×64 arriba → name 3xl → locality xs → chips
//     wrap → trust copy → buttons stacked full-width
//   - desktop (≥ md): logo 96×96 a la izquierda, columna derecha con
//     name 4xl + chips inline + buttons inline
//
// Chips (en orden):
//   - ✓ Verificado (siempre — la visibility gate ya filtra)
//   - 🏠 Refugio  o  🌎 Red de rescate (según orgType)
//   - 📅 Desde {año} (sólo si verifiedAt > 1 año atrás)
//
// Botones:
//   - "Contactar al refugio" (primary) → ?sheet=contactar (P2-8)
//   - "Compartir" (secondary) → ?sheet=compartir-org (P2-9)
//
// Trust copy literal del handoff §P2-2. Logo fallback = inicial del
// displayName sobre fondo gob-primary cuando no hay logo storage path.

interface Props {
  org: OrgPublicProfile;
  /** Pre-rendered locality + province display string from the page so
   * we don't re-resolve the province name here. */
  localityLabel: string | null;
}

const TRUST_COPY =
  "Refugio verificado por MiMAR. Las postulaciones llegan directo al equipo del refugio, que coordina los próximos pasos por email con cada candidato.";

export function OrgHero({ org, localityLabel }: Props) {
  const logoUrl = orgLogoUrl(org.logoStoragePath);
  const initial = org.displayName.charAt(0).toUpperCase();

  // "📅 Desde {año}" chip — only when verified more than a year ago.
  const showYearChip =
    org.verifiedAt && Date.now() - org.verifiedAt.getTime() > 365 * 24 * 60 * 60 * 1000;
  const verifiedYear = org.verifiedAt?.getFullYear();

  const orgTypeChipLabel = org.orgType === "shelter" ? "🏠 Refugio" : "🌎 Red de rescate";

  return (
    <header className="space-y-4 md:flex md:items-start md:gap-6 md:space-y-0">
      {/* Logo — 64x64 mobile (within the flow), 96x96 desktop (left col) */}
      <div className="shrink-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`Logo de ${org.displayName}`}
            className="h-16 w-16 md:h-24 md:w-24 rounded-full object-cover border border-gob-border-strong bg-white"
          />
        ) : (
          <div
            role="img"
            aria-label={`Logo de ${org.displayName}`}
            className="h-16 w-16 md:h-24 md:w-24 rounded-full bg-gob-primary text-white text-2xl md:text-3xl font-semibold flex items-center justify-center border border-gob-border-strong"
          >
            {initial}
          </div>
        )}
      </div>

      {/* Right column on desktop / stacked content on mobile */}
      <div className="flex-1 space-y-3">
        <div className="space-y-1">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gob-text">
            {org.displayName}
          </h1>
          {org.legalName && org.legalName !== org.displayName && (
            <p className="text-xs text-gob-text-muted">{org.legalName}</p>
          )}
          {localityLabel && <p className="text-xs text-gob-text-muted">{localityLabel}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="?sheet=verificacion-info" className="focus:outline-none">
            <Badge variant="success">✓ Verificado</Badge>
          </Link>
          <Badge variant="neutral">{orgTypeChipLabel}</Badge>
          {showYearChip && verifiedYear && <Badge variant="neutral">📅 Desde {verifiedYear}</Badge>}
        </div>

        <p className="text-xs text-gob-text-muted max-w-prose leading-relaxed">{TRUST_COPY}</p>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Link
            href="?sheet=contactar"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gob-primary text-white text-sm font-semibold px-4 py-2.5 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste focus-visible:ring-offset-2 transition-opacity"
          >
            ✉ Contactar al refugio
          </Link>
          <Link
            href="?sheet=compartir-org"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gob-border bg-white text-gob-text text-sm font-medium px-4 py-2.5 hover:bg-gob-surface-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste focus-visible:ring-offset-2 transition-colors"
          >
            ↗ Compartir
          </Link>
        </div>
      </div>
    </header>
  );
}
