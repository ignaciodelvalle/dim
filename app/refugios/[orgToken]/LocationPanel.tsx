import Link from "next/link";

import { LnCard, LnCardBody } from "@/components/ui/Card";
import { LnSectionHead } from "@/components/ui/DocElements";
import type { OrgPublicProfile } from "@/lib/org-public-profile";

// "Dónde estamos" panel (handoff P2-6) — Libreta Nacional look.
//
// Three render branches:
//   1. lat/lng set AND disclose_address=true (gated by queryOrgPublicProfile,
//      which nulls lat/lng when disclose_address is false) → mapa
//      embebido + "Cómo llegar" link
//   2. only jurisdiction (province + locality, no point) → solo texto
//      "Operan en {Localidad}, {Provincia}"
//   3. disclose_address=false → panel doesn't render
//
// Implementation note: we considered server-side rendering via the
// `staticmaps` lib (D2 default), but its `sharp` dep doesn't build
// reliably for the Vercel linux-x64 runtime when installed from a
// Windows dev box. Iframe is the no-deps, zero-runtime-risk fallback —
// OSM hosts the embed page and serves tiles directly to the visitor's
// browser. Cookie footprint is OSM's own; acceptable for a public
// refugio profile (no PII on the page surrounding the iframe).

interface Props {
  org: OrgPublicProfile;
  /** Pre-computed jurisdiction label "Localidad, Provincia" or null. */
  localityLabel: string | null;
}

// ~0.012 degrees per direction at zoom ~14 gives a city-block view.
const BBOX_HALF_DEG = 0.012;

function buildOsmEmbedSrc(lat: number, lng: number): string {
  const minLon = lng - BBOX_HALF_DEG;
  const maxLon = lng + BBOX_HALF_DEG;
  const minLat = lat - BBOX_HALF_DEG;
  const maxLat = lat + BBOX_HALF_DEG;
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const marker = `${lat},${lng}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${marker}&layer=mapnik`;
}

export function LocationPanel({ org, localityLabel }: Props) {
  const hasPoint = org.latitude != null && org.longitude != null;

  if (!hasPoint && !localityLabel) return null;

  return (
    <section aria-label="Dónde estamos">
      <LnSectionHead title="Dónde estamos" className="mb-4" />
      <LnCard>
        <LnCardBody>
          {hasPoint && org.latitude != null && org.longitude != null ? (
            <>
              <iframe
                title={`Mapa con la ubicación de ${org.displayName}${
                  localityLabel ? ` en ${localityLabel}` : ""
                }`}
                src={buildOsmEmbedSrc(org.latitude, org.longitude)}
                className="rounded-[4px] w-full aspect-video md:aspect-[21/9] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)]"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {localityLabel && (
                <p className="mt-3 text-sm font-medium text-[var(--color-ln-ink)]">
                  {localityLabel}
                </p>
              )}
              <Link
                href="?sheet=como-llegar"
                className="inline-flex items-center gap-1 mt-2 text-sm text-[var(--color-ln-azul)] hover:underline focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)] rounded"
              >
                Cómo llegar →
              </Link>
            </>
          ) : (
            localityLabel && (
              <p className="text-sm text-[var(--color-ln-ink)]">
                Operan en <span className="font-medium">{localityLabel}</span>.
              </p>
            )
          )}
        </LnCardBody>
      </LnCard>
    </section>
  );
}
