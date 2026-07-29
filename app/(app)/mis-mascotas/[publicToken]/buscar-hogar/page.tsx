// Buscar nuevo hogar — Libreta Nacional redesign.
// Presentation only; RehomeRequestForm and data fetching unchanged.

import { LnEmptyState } from "@/components/ui/EmptyState";
import { db, organizationCoverage, organizations, ownerships, pets, profiles } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RehomeRequestForm } from "./RehomeRequestForm";

export default async function BuscarHogarPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const { user } = await requireUserOrRedirect();

  const [accessRow] = await db
    .select({
      pet: pets,
      ownershipId: ownerships.id,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        eq(ownerships.role, "foster"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!accessRow) notFound();

  const pet = accessRow.pet;
  const province = pet.jurisdictionProvince ?? null;
  const locality = pet.jurisdictionLocality ?? null;

  const [profileRow] = await db
    .select({ displayName: profiles.displayName, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const fosterName = profileRow?.displayName ?? user.id;

  const coveringOrgs = await (async () => {
    if (!province) return [];

    const localityPredicate =
      locality !== null
        ? or(
            eq(organizationCoverage.jurisdictionLocality, locality),
            isNull(organizationCoverage.jurisdictionLocality),
          )
        : undefined;

    const rows = await db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        orgType: organizations.orgType,
        verified: organizations.verified,
        publicToken: organizations.publicToken,
        email: organizations.email,
        phone: organizations.phone,
        jurisdictionProvince: organizationCoverage.jurisdictionProvince,
        jurisdictionLocality: organizationCoverage.jurisdictionLocality,
      })
      .from(organizations)
      .innerJoin(organizationCoverage, eq(organizationCoverage.organizationId, organizations.id))
      .where(
        and(
          eq(organizations.verified, true),
          inArray(organizations.orgType, ["shelter", "rescue_network"]),
          eq(organizationCoverage.jurisdictionProvince, province),
          localityPredicate,
        ),
      );

    const seen = new Set<string>();
    const deduped: typeof rows = [];
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        deduped.push(row);
      }
    }
    return deduped;
  })();

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href={`/mis-mascotas/${publicToken}`}
        className="mb-5 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← {pet.name}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-3xl font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
          Buscar nuevo hogar para {pet.name}
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Estas organizaciones están verificadas y operan en tu zona. Enviando una solicitud, les
          avisás que {pet.name} necesita un hogar definitivo.
        </p>
      </div>

      {coveringOrgs.length === 0 ? (
        <LnEmptyState
          variant="dashed"
          title={
            province
              ? `No encontramos refugios verificados en ${locality ?? province} registrados en el sistema. Podés contactar organizaciones directamente o pedir al refugio que hoy tiene a ${pet.name} que busque un voluntario.`
              : `${pet.name} no tiene provincia registrada. Editá el perfil para poder buscar organizaciones cercanas.`
          }
          action={
            !province ? (
              <Link
                href={`/mis-mascotas/${publicToken}/editar`}
                className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
              >
                Editar mascota →
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)]">
          {coveringOrgs.map((org) => (
            <div
              key={org.id}
              className="flex flex-col gap-2.5 border-b border-[var(--color-ln-line-2)] px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-[var(--font-ln-serif)] text-md font-semibold text-[var(--color-ln-ink)]">
                  {org.displayName}
                </p>
                <p className="mt-0.5 font-[var(--font-ln-mono)] text-[10.5px] capitalize text-[var(--color-ln-mute)]">
                  {org.orgType === "rescue_network" ? "Red de rescate" : "Refugio"}
                  {" · "}
                  {org.jurisdictionLocality ?? org.jurisdictionProvince}
                </p>
              </div>
              <RehomeRequestForm
                petPublicToken={publicToken}
                targetOrgId={org.id}
                orgDisplayName={org.displayName}
                fosterName={fosterName}
              />
            </div>
          ))}
        </div>
      )}

      <p className="mt-5 text-sm text-[var(--color-ln-mute)]">
        Las organizaciones recibirán una notificación con tus datos de contacto para hacer el
        seguimiento. No se compromete ningún acuerdo — es un primer contacto.
      </p>
    </div>
  );
}
