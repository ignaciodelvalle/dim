"use client";

import { Sheet } from "@/components/poncho/Sheet";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// "Qué significa verificado" — educational text. No form. Handoff P2-9.

interface Props {
  verifiedByName: string | null;
  verifiedAt: Date | null;
}

function formatVerifiedDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

export function VerificacionInfoSheet({ verifiedByName, verifiedAt }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("sheet") === "verificacion-info";

  return (
    <Sheet
      id="verificacion-info"
      title="¿Qué significa que esté verificado?"
      open={open}
      onClose={() => router.replace(buildCloseSheetUrl(pathname, searchParams))}
      size="md"
    >
      <div className="space-y-4 text-sm text-gob-text-gray leading-relaxed">
        <p>
          <span className="font-semibold text-gob-text">Verificado por MiMAR</span> significa que el
          equipo confirmó que este refugio existe, tiene personería jurídica activa o un convenio
          con autoridad sanitaria, y que el contacto que figura responde.
        </p>
        <p>
          Las postulaciones de adopción que mandás desde MiMAR llegan directo al equipo del refugio.
          Coordinan los próximos pasos por email con cada candidato. MiMAR no interviene en la
          decisión final ni en la entrega del animal.
        </p>
        <p>
          Si tenés dudas sobre este refugio en particular o pensás que algo no encaja, escribinos a{" "}
          <a className="text-gob-azul-link underline" href="mailto:hola@mimar.ar">
            hola@mimar.ar
          </a>
          .
        </p>

        {(verifiedByName || verifiedAt) && (
          <div className="rounded-xl border border-gob-border bg-gob-surface-alt p-3 text-xs text-gob-text-gray space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">
              Datos de verificación
            </p>
            {verifiedByName && (
              <p>
                Verificó: <span className="font-medium text-gob-text">{verifiedByName}</span>
              </p>
            )}
            {verifiedAt && <p>Fecha: {formatVerifiedDate(verifiedAt)}</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
