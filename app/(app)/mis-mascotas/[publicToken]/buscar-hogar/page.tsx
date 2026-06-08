// Buscar nuevo hogar — foster CTA 2.
//
// Lists verified shelter/rescue_network orgs covering the pet's jurisdiction
// (province/locality). No capacity filter. For each org, shows a
// "Enviar solicitud" button that sends a best-effort rehome request
// notification to the org's admins/coordinators.
//
// Auth: requirePetAccess (owner path) + active foster row check (enforced
// server-side in sendRehomeRequestAction).

import {
  db,
  organizationCoverage,
  organizationMemberships,
  organizations,
  ownerships,
  pets,
  profiles,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
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

  // 1. Load pet + verify caller has an active foster row.
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

  // 2. Load foster user's display name for the request body.
  const [profileRow] = await db
    .select({ displayName: profiles.displayName, phone: profiles.phone })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const fosterName = profileRow?.displayName ?? user.id;

  // 3. Query verified shelter/rescue_network orgs covering this jurisdiction.
  //    Mirrors the lost-pet-broadcast locality predicate exactly.
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

    // Deduplicate by org id (one org may have multiple coverage rows).
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
    <main className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <Link
            href={`/mis-mascotas/${publicToken}`}
            className="text-sm text-gob-text-muted hover:text-gob-text"
          >
            ← Volver al perfil
          </Link>
          <h1 className="text-2xl font-semibold text-gob-text">
            Buscar nuevo hogar para {pet.name}
          </h1>
          <p className="text-sm text-gob-text-muted">
            Estas organizaciones están verificadas y operan en tu zona. Enviando una solicitud, les
            avisás que {pet.name} necesita un hogar definitivo.
          </p>
        </header>

        {coveringOrgs.length === 0 ? (
          <div className="rounded-lg border border-gob-border p-6 text-center space-y-2">
            <p className="text-gob-text-muted text-sm">
              {province
                ? `No encontramos refugios verificados en ${locality ?? province} registrados en el sistema. Podés contactar organizaciones directamente o pedir al refugio que hoy tiene a ${pet.name} que busque un voluntario.`
                : `${pet.name} no tiene provincia registrada. Editá el perfil para poder buscar organizaciones cercanas.`}
            </p>
            {!province && (
              <Link
                href={`/mis-mascotas/${publicToken}/editar`}
                className="inline-block text-sm text-gob-primary underline"
              >
                Editar mascota
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {coveringOrgs.map((org) => (
              <li
                key={org.id}
                className="rounded-xl border border-gob-border p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-gob-text">{org.displayName}</p>
                  <p className="text-xs text-gob-text-muted capitalize">
                    {org.orgType === "rescue_network" ? "Red de rescate" : "Refugio"} ·{" "}
                    {org.jurisdictionLocality ?? org.jurisdictionProvince}
                  </p>
                </div>
                <RehomeRequestForm
                  petPublicToken={publicToken}
                  targetOrgId={org.id}
                  orgDisplayName={org.displayName}
                  fosterName={fosterName}
                />
              </li>
            ))}
          </ul>
        )}

        <footer className="pt-4 border-t border-gob-border text-sm text-gob-text-muted">
          Las organizaciones recibirán una notificación con tus datos de contacto para hacer el
          seguimiento. No se compromete ningún acuerdo — es un primer contacto.
        </footer>
      </div>
    </main>
  );
}
