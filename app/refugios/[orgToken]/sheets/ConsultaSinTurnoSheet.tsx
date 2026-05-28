"use client";

import { Sheet } from "@/components/poncho/Sheet";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// "Consulta sin turno" — for offerings flagged requiresAppointment=false.
// Surfaces phone + hours + address so the visitor can drop by directly.
// Handoff P2-9.
//
// In v1 we don't have a structured "horarios" column on organizations;
// the sheet shows whatever channels are available and a generic copy.
// When the schedule lookup lands, this becomes the canonical surface
// for it.

interface Props {
  orgDisplayName: string;
  orgEmail: string | null;
  orgPhone: string | null;
  jurisdictionLabel: string | null;
}

export function ConsultaSinTurnoSheet({
  orgDisplayName,
  orgEmail,
  orgPhone,
  jurisdictionLabel,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("sheet") === "consulta-sin-turno";

  return (
    <Sheet
      id="consulta-sin-turno"
      title="Consulta sin turno"
      open={open}
      onClose={() => router.replace(buildCloseSheetUrl(pathname, searchParams))}
      size="sm"
    >
      <div className="space-y-4 text-sm text-gob-text-gray">
        <p>
          Este servicio no requiere turno previo. Contactá directamente con {orgDisplayName} para
          coordinar el día y la hora.
        </p>

        <div className="space-y-2">
          {orgPhone && (
            <div className="rounded-xl border border-gob-border bg-gob-surface-alt p-3">
              <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Teléfono</p>
              <a href={`tel:${orgPhone}`} className="text-base text-gob-azul-link underline">
                {orgPhone}
              </a>
            </div>
          )}
          {orgEmail && (
            <div className="rounded-xl border border-gob-border bg-gob-surface-alt p-3">
              <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Email</p>
              <a href={`mailto:${orgEmail}`} className="text-base text-gob-azul-link underline">
                {orgEmail}
              </a>
            </div>
          )}
          {jurisdictionLabel && (
            <div className="rounded-xl border border-gob-border bg-gob-surface-alt p-3">
              <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Zona</p>
              <p className="text-base text-gob-text">{jurisdictionLabel}</p>
            </div>
          )}
          {!orgPhone && !orgEmail && (
            <p className="text-xs text-gob-text-muted">
              {orgDisplayName} no tiene canales directos publicados. Mandá un mensaje desde el botón
              "Contactar al refugio" en la parte de arriba.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
