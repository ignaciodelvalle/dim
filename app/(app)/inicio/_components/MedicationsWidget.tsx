import Link from "next/link";

import type { OngoingMedication } from "@/lib/owner-dashboard";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function MedicationsWidget({ medications }: { medications: OngoingMedication[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-gob-text ">Tratamientos en curso</h2>
      </div>
      {medications.length === 0 ? (
        <div className="border border-dashed border-gob-border-strong  rounded-xl p-6 text-center text-sm text-gob-text-muted ">
          Ninguna mascota está bajo tratamiento activo en este momento.
        </div>
      ) : (
        <ul className="space-y-2">
          {medications.map((m) => (
            <li key={m.eventId}>
              <Link
                href={`/mis-mascotas/${m.petPublicToken}/historial`}
                className="block border border-gob-border  rounded-xl p-4 hover:bg-gob-surface-alt  transition-colors"
              >
                <p className="text-sm font-medium text-gob-text  truncate">{m.drugName}</p>
                <p className="text-xs text-gob-text-muted ">
                  {m.petName} · desde {formatDate(m.startedAt)}
                  {m.frequency && ` · ${m.frequency}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
