"use client";

import { Sheet } from "@/components/ui/VaulSheet";
import { buildCloseSheetUrl } from "@/lib/ui/sheet-helpers";
import { closeSheetNav } from "@/lib/ui/sheet-nav";
import { usePathname, useSearchParams } from "next/navigation";

// "Qué significa verificado" — educational text. No form. Handoff P2-9.

interface Props {
  verifiedByName: string | null;
  verifiedAt: Date | null;
}

function formatVerifiedDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
}

export function VerificacionInfoSheet({ verifiedByName, verifiedAt }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const open = searchParams.get("sheet") === "verificacion-info";

  return (
    <Sheet
      id="verificacion-info"
      title="¿Qué significa que esté verificado?"
      open={open}
      onClose={() => closeSheetNav(buildCloseSheetUrl(pathname, searchParams))}
      size="md"
    >
      <div className="space-y-4 text-sm text-[var(--color-ln-ink-2)] leading-relaxed">
        <p>
          <span className="font-semibold text-[var(--color-ln-ink)]">Verificado por MiMAR</span>{" "}
          significa que el equipo confirmó que este refugio existe, tiene personería jurídica activa
          o un convenio con autoridad sanitaria, y que el contacto que figura responde.
        </p>
        <p>
          Las postulaciones de adopción que mandás desde MiMAR llegan directo al equipo del refugio.
          Coordinan los próximos pasos por email con cada candidato. MiMAR no interviene en la
          decisión final ni en la entrega del animal.
        </p>
        <p>
          Si tenés dudas sobre este refugio en particular o pensás que algo no encaja, escribinos a{" "}
          <a className="text-[var(--color-ln-azul)] underline" href="mailto:hola@mimar.ar">
            hola@mimar.ar
          </a>
          .
        </p>

        {(verifiedByName || verifiedAt) && (
          <div className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] p-3 text-xs text-[var(--color-ln-ink-2)] space-y-1">
            <p className="text-xs uppercase tracking-wider text-[var(--color-ln-mute)]">
              Datos de verificación
            </p>
            {verifiedByName && (
              <p>
                Verificó:{" "}
                <span className="font-medium text-[var(--color-ln-ink)]">{verifiedByName}</span>
              </p>
            )}
            {verifiedAt && <p>Fecha: {formatVerifiedDate(verifiedAt)}</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
