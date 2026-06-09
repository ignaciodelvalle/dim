import Link from "next/link";

import type { DashboardPet } from "@/lib/owner-dashboard";
import { petPhotoUrl } from "@/lib/storage";

// Quick capture widget. The user picks the pet first (no real chat box
// here — the matcher only runs once they land on /mis-mascotas/{token}/anotar).
//
// Why not embed a textarea here: the matcher needs a pet context for
// future slot extraction (e.g. species-aware vaccine hints), and
// landing on the per-pet /anotar page also unlocks the quick-action
// shortcuts. Keeping the home minimal.

export function QuickCaptureWidget({ pets }: { pets: DashboardPet[] }) {
  if (pets.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">Captura rápida</h2>
        <div className="border border-dashed border-[var(--color-ln-line-strong)] rounded-xl p-6 text-center text-sm text-[var(--color-ln-mute)]">
          Cargá una mascota para empezar a anotar eventos.
        </div>
      </section>
    );
  }

  const visible = pets.filter((p) => p.status !== "deceased").slice(0, 5);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">Captura rápida</h2>
      </div>
      <p className="text-xs text-[var(--color-ln-mute)]">
        Elegí una mascota para anotar algo (vacuna, peso, vet, etc.):
      </p>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((pet) => {
          const photo = petPhotoUrl(pet.primaryPhotoStoragePath);
          return (
            <li key={pet.id}>
              <Link
                href={`/mis-mascotas/${pet.publicToken}/anotar`}
                className="flex items-center gap-2 p-2 rounded-lg border border-[var(--color-ln-line)] hover:bg-[var(--color-ln-celeste-050)] hover:border-[var(--color-ln-azul)] transition-colors"
              >
                {photo ? (
                  <img
                    src={photo}
                    alt={pet.name}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[var(--color-ln-stripe)] flex items-center justify-center text-sm font-semibold text-[var(--color-ln-ink-2)] shrink-0">
                    {pet.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-[var(--color-ln-ink)] truncate">
                  {pet.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
