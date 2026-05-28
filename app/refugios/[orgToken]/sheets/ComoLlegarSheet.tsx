"use client";

import { Sheet } from "@/components/poncho/Sheet";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// "Cómo llegar" — three navigator deep-links (handoff P2-9).
// Only renders when lat/lng are set; the LocationPanel only triggers
// this sheet when it has coordinates to show.

interface Props {
  orgDisplayName: string;
  latitude: number | null;
  longitude: number | null;
}

export function ComoLlegarSheet({ orgDisplayName, latitude, longitude }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("sheet") === "como-llegar";

  const hasPoint = latitude != null && longitude != null;
  const coord = hasPoint ? `${latitude},${longitude}` : "";

  return (
    <Sheet
      id="como-llegar"
      title={`Cómo llegar a ${orgDisplayName}`}
      open={open}
      onClose={() => router.replace(buildCloseSheetUrl(pathname, searchParams))}
      size="sm"
    >
      <div className="space-y-4">
        {hasPoint ? (
          <>
            <p className="text-sm text-gob-text-gray">
              Elegí la app que prefieras para abrir la ruta. Se abre en una pestaña nueva.
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${coord}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gob-border bg-white px-4 py-3 text-center text-sm font-medium text-gob-text hover:bg-gob-surface-alt"
              >
                Abrir en Google Maps
              </a>
              <a
                href={`http://maps.apple.com/?daddr=${coord}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gob-border bg-white px-4 py-3 text-center text-sm font-medium text-gob-text hover:bg-gob-surface-alt"
              >
                Abrir en Apple Maps
              </a>
              <a
                href={`https://waze.com/ul?ll=${coord}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gob-border bg-white px-4 py-3 text-center text-sm font-medium text-gob-text hover:bg-gob-surface-alt"
              >
                Abrir en Waze
              </a>
            </div>
          </>
        ) : (
          <p className="text-sm text-gob-text-muted">
            {orgDisplayName} no compartió su ubicación exacta. Contactalos para coordinar.
          </p>
        )}
      </div>
    </Sheet>
  );
}
