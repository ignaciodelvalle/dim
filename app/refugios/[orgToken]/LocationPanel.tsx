import Link from "next/link";

import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import type { OrgPublicProfile } from "@/lib/org-public-profile";

// "Dónde estamos" panel (handoff P2-6).
//
// Three render branches:
//   1. lat/lng set AND disclose_address=true (gated by queryOrgPublicProfile,
//      which nulls lat/lng when disclose_address is false) → mapa + address +
//      "Cómo llegar" link
//   2. only jurisdiction (province + locality, no point) → solo texto
//      "Operan en {Localidad}, {Provincia}"
//   3. disclose_address=false → panel doesn't render at all
//
// queryOrgPublicProfile already handles (3) — when disclose_address is
// false, latitude/longitude come back as null. So here we only branch
// between (1) and (2) — and skip the panel entirely if even the
// jurisdiction text would be empty.

interface Props {
  org: OrgPublicProfile;
  /** Pre-computed jurisdiction label "Localidad, Provincia" or null. */
  localityLabel: string | null;
}

export function LocationPanel({ org, localityLabel }: Props) {
  const hasPoint = org.latitude != null && org.longitude != null;

  // Nothing to show → don't render (P2-6: no empty placeholders).
  if (!hasPoint && !localityLabel) return null;

  const mapSrc = hasPoint
    ? `/api/static-map?lat=${org.latitude}&lng=${org.longitude}&zoom=15&w=800&h=450`
    : null;

  return (
    <Panel aria-labelledby="ubicacion-title">
      <PanelHeader title={<span id="ubicacion-title">Dónde estamos</span>} />
      <PanelBody>
        {mapSrc ? (
          <>
            <img
              src={mapSrc}
              alt={`Mapa con la ubicación de ${org.displayName}${
                localityLabel ? ` en ${localityLabel}` : ""
              }`}
              className="rounded-xl w-full aspect-video md:aspect-[21/9] object-cover bg-gob-surface-alt"
              loading="lazy"
            />
            {localityLabel && (
              <p className="mt-3 text-sm font-medium text-gob-text">{localityLabel}</p>
            )}
            <Link
              href="?sheet=como-llegar"
              className="inline-flex items-center gap-1 mt-2 text-sm text-gob-azul-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste rounded"
            >
              Cómo llegar →
            </Link>
          </>
        ) : (
          // Only jurisdiction, no point — surface the text alone (no empty
          // map gradient, no degraded placeholder).
          localityLabel && (
            <p className="text-sm text-gob-text">
              Operan en <span className="font-medium">{localityLabel}</span>.
            </p>
          )
        )}
      </PanelBody>
    </Panel>
  );
}
