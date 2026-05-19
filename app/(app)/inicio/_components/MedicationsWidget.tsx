import Link from "next/link";

import type { OngoingMedication } from "@/lib/owner-dashboard";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function MedicationsWidget({ medications }: { medications: OngoingMedication[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-50">
          Tratamientos en curso
        </h2>
      </div>
      {medications.length === 0 ? (
        <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-6 text-center text-sm text-neutral-500 dark:text-neutral-500">
          Ninguna mascota está bajo tratamiento activo en este momento.
        </div>
      ) : (
        <ul className="space-y-2">
          {medications.map((m) => (
            <li key={m.eventId}>
              <Link
                href={`/mis-mascotas/${m.petPublicToken}/historial`}
                className="block border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
              >
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                  {m.drugName}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-500">
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
