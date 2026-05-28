import Link from "next/link";

import { PetCard } from "@/components/PetCard";
import type { Pet } from "@/db";
import type { DashboardPet } from "@/lib/owner-dashboard";
import { petPhotoUrl } from "@/lib/storage";

// PetCard expects a full Pet but only reads name/species/color/publicToken.
// The dashboard helper returns just those (plus a few). Narrow cast keeps
// the call site readable without `any`.
function buildPartialPet(p: DashboardPet): Pet {
  return p as unknown as Pet;
}

// Mini grid of pets on the dashboard. Up to 6 pets shown; if there are
// more, a "Ver todas" link goes to /mis-mascotas. Zero pets → CTA to
// add a first pet (matches the empty-state from /mis-mascotas).

export function PetsGridWidget({ pets }: { pets: DashboardPet[] }) {
  if (pets.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-gob-text ">Mis mascotas</h2>
        </div>
        <div className="border border-dashed border-gob-border-strong  rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-gob-text-gray ">Todavía no cargaste ninguna mascota.</p>
          <Link
            href="/mis-mascotas/nueva"
            className="inline-block px-4 py-2 rounded-lg bg-gob-primary  text-white  text-sm font-medium"
          >
            Agregar mi primera mascota
          </Link>
        </div>
      </section>
    );
  }

  const visible = pets.slice(0, 6);
  const hasMore = pets.length > visible.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-gob-text ">Mis mascotas</h2>
        <Link
          href="/mis-mascotas"
          className="text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          {hasMore ? `Ver las ${pets.length} →` : "Ver todas →"}
        </Link>
      </div>
      <ul className="space-y-2">
        {visible.map((pet) => (
          <PetCard
            key={pet.id}
            pet={buildPartialPet(pet)}
            photoUrl={petPhotoUrl(pet.primaryPhotoStoragePath)}
            ownershipRole={pet.ownershipRole}
          />
        ))}
      </ul>
    </section>
  );
}
