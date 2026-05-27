import Link from "next/link";

import { Badge } from "@/components/poncho/Badge";
import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import type { PublicServiceOffering } from "@/lib/org-public-offerings";

// "Servicios" panel (handoff P2-5).
//
// Render-or-don't-render: when the offerings list is empty, the panel
// doesn't render at all. The org owner explicitly opts each offering
// into the public surface via service_offerings.is_public (P1-3); the
// privacy-first default keeps surfaces clean by default.
//
// Each row:
//   [emoji 32px] Title
//                Short description (one line)
//                [chips: Gratuito / Sin turno / Próximo / Sin agenda]
//                                                        Reservar →
//
// Click:
//   - requiresAppointment → /turnos/buscar/{token}
//   - otherwise → ?sheet=consulta-sin-turno (P2-9 sheet)

const KIND_EMOJI: Record<string, string> = {
  sterilization: "✂",
  vaccine: "💉",
  microchip: "📍",
  consultation: "🩺",
  other: "🐾",
};

function kindEmoji(kind: string): string {
  return KIND_EMOJI[kind] ?? KIND_EMOJI.other;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

interface Props {
  orgToken: string;
  offerings: PublicServiceOffering[];
}

const MAX_VISIBLE = 8;

export function ServicesPanel({ orgToken, offerings }: Props) {
  if (offerings.length === 0) return null;

  const visible = offerings.slice(0, MAX_VISIBLE);
  const hasMore = offerings.length > MAX_VISIBLE;

  return (
    <Panel aria-labelledby="servicios-title">
      <PanelHeader
        title={<span id="servicios-title">Servicios</span>}
        actions={
          hasMore && (
            <Link href={`/turnos/buscar?org=${orgToken}`} className="text-sm text-gob-azul-link">
              Ver todos los servicios →
            </Link>
          )
        }
      />
      <PanelBody>
        <ul className="divide-y divide-gob-border">
          {visible.map((offering) => {
            const href = offering.requiresAppointment
              ? `/turnos/buscar/${offering.offeringToken}`
              : `?sheet=consulta-sin-turno&offering=${offering.offeringToken}`;
            return (
              <li key={offering.offeringToken}>
                <Link
                  href={href}
                  className="flex items-start gap-3 py-3 transition-colors hover:bg-gob-surface-alt rounded px-2 -mx-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-celeste"
                >
                  <span aria-hidden className="text-2xl shrink-0 mt-0.5">
                    {kindEmoji(offering.serviceKind)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium text-gob-text">{offering.title}</p>
                    {offering.description && (
                      <p className="text-xs text-gob-text-muted line-clamp-1">
                        {offering.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {offering.free && <Badge variant="success">Gratuito</Badge>}
                      {!offering.requiresAppointment && <Badge variant="neutral">Sin turno</Badge>}
                      {offering.nextAvailableSlot && (
                        <Badge variant="info">
                          Próximo: {formatDate(offering.nextAvailableSlot)}
                        </Badge>
                      )}
                      {offering.requiresAppointment && !offering.nextAvailableSlot && (
                        <Badge variant="warning">Sin agenda activa</Badge>
                      )}
                    </div>
                  </div>
                  <span aria-hidden className="text-sm text-gob-azul-link shrink-0 mt-1">
                    Reservar →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </PanelBody>
    </Panel>
  );
}
