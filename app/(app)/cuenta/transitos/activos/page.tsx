// Tránsitos activos — Libreta Nacional redesign.
// CoFosterToggle (client component) unchanged.

import { LnEmptyState } from "@/components/ui/EmptyState";
import { db, organizations, ownerships, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { speciesLabel } from "@/lib/utils/format";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { CoFosterToggle } from "./CoFosterToggle";

export default async function TransitosActivosPage() {
  const { user } = await requireUserOrRedirect();

  const rows = await db
    .select({ ownership: ownerships, pet: pets })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, user.id),
        eq(ownerships.role, "foster"),
        isNull(ownerships.endedAt),
      ),
    );

  const orgMap = new Map<string, { displayName: string; publicToken: string }>();
  if (rows.length > 0) {
    const petIds = rows.map((r) => r.pet.id);
    for (const pid of petIds) {
      const [orgRow] = await db
        .select({ org: organizations })
        .from(ownerships)
        .innerJoin(organizations, eq(organizations.id, ownerships.ownerOrganizationId))
        .where(
          and(
            eq(ownerships.petId, pid),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (orgRow) {
        orgMap.set(pid, {
          displayName: orgRow.org.displayName,
          publicToken: orgRow.org.publicToken,
        });
      }
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-5 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Tránsitos activos
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Mascotas que estás cuidando hoy. Tenés los mismos permisos sobre la libreta sanitaria y
          eventos que un dueño mientras dure el tránsito.
        </p>
      </div>

      {rows.length === 0 ? (
        <LnEmptyState
          variant="dashed"
          title="No tenés tránsitos activos."
          action={
            <Link
              href="/cuenta/transitos/propuestas"
              className="text-[12.5px] text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              Mirá tus propuestas →
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(({ ownership, pet }) => {
            const org = orgMap.get(pet.id);
            return (
              <div
                key={ownership.id}
                className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]"
              >
                <div className="px-4 py-3.5">
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}`}
                    className="font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink)] no-underline hover:underline"
                  >
                    {pet.name}
                  </Link>
                  <p className="mt-0.5 font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
                    {speciesLabel(pet.species)}
                    {pet.breed && ` · ${pet.breed}`}
                    {org && ` · refugio: ${org.displayName}`}
                  </p>
                </div>
                <div className="border-t border-[var(--color-ln-line-2)] px-4 py-3">
                  <CoFosterToggle
                    fosterOwnershipId={ownership.id}
                    initial={ownership.allowCoFoster}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nav footer */}
      <div className="mt-8 flex gap-5 border-t border-[var(--color-ln-line-2)] pt-3.5 font-[var(--font-ln-mono)] text-[11px]">
        <Link
          href="/cuenta/transitos/propuestas"
          className="text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          Propuestas
        </Link>
        <Link
          href="/cuenta/transitos/historial"
          className="text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          Historial
        </Link>
      </div>
    </div>
  );
}
