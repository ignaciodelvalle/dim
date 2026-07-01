import Link from "next/link";

import { LnEmptyState } from "@/components/ui/EmptyState";
import type { OngoingMedication } from "@/lib/analytics/owner-dashboard";

function formatDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function MedicationsWidget({ medications }: { medications: OngoingMedication[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">Tratamientos en curso</h2>
      </div>
      {medications.length === 0 ? (
        <LnEmptyState
          variant="dashed"
          title="Ninguna mascota está bajo tratamiento activo en este momento."
        />
      ) : (
        <ul className="space-y-2">
          {medications.map((m) => (
            <li key={m.eventId}>
              <Link
                href={`/mis-mascotas/${m.petPublicToken}?tab=historial`}
                className="block border border-[var(--color-ln-line)] rounded-xl p-4 hover:bg-[var(--color-ln-stripe)] transition-colors"
              >
                <p className="text-sm font-medium text-[var(--color-ln-ink)] truncate">
                  {m.drugName}
                </p>
                <p className="text-xs text-[var(--color-ln-mute)]">
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
