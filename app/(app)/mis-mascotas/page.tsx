// Mis Mascotas — the owner index + inbox (owner-ia-redesign P5).
//
// /inicio folded away (it now redirects into the most-urgent pet's credential),
// so this page carries the surfaces a per-pet swipe structurally cannot:
//   1. the cross-pet ROLLUP (decision 3 / inventory §9.1) — "is anything on
//      fire across all my pets?" — próximos vencimientos, al día, casos.
//   2. the INBOX (decision 4 / §9.2) — everything that is NOT (yet) your pet and
//      so has no credential to live on: open workflows (foster proposals,
//      denuncias, custody, approvals) AND their closed history, inbound
//      transfers, adoption postulaciones, plus the resume-application banner.
//   3. the per-pet INDEX — the CredCard credential rows (moved here from the
//      old home carousel), with a real name search (§9.3) so the 200-cap notice
//      stops promising a buscador that never existed.
//   4. "En memoria" — deceased pets live HERE ONLY (decision 6), never in the
//      swipe.
//   5. reclamar — the claim-code entry.
//
// The vet role redirect and its ?as=owner escape hatch are preserved verbatim
// (inventory §8): a vet who also owns pets reaches their own pets only via
// ?as=owner; dropping it would send every vet to the owner index.

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ActionLinkCard } from "@/components/ActionLinkCard";
import { CasesWidget, adaptWorkflow } from "@/components/CasesWidget";
import { isTransitRole } from "@/components/PetCard.helpers";
import { LnBadge } from "@/components/ui/Badge";
import { LnButton } from "@/components/ui/Button";
import type { LnPetStatus } from "@/components/ui/Chip";
import { LnSectionHead } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { LnRegRow, LnRegistry } from "@/components/ui/RegRow";
import { attachments, db, ownerships, pets } from "@/db";
import {
  countPendingApplications,
  countPendingTransfers,
  fetchActiveReminders,
  fetchComplianceStatesForPets,
  fetchOpenWorkflows,
  fetchPreviousWorkflows,
} from "@/lib/analytics/owner-dashboard";
import { petUrgencyRank } from "@/lib/domain/pet-urgency-rank";
import { countProximosReminders } from "@/lib/domain/vaccine-reminder-state";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { PET_CARD_PHOTO_SELECT, PET_CARD_SELECT } from "@/lib/infra/pet-projections";
import { getProfileCached } from "@/lib/infra/request-cache";
import { resolveVetLanding } from "@/lib/infra/role-landing";
import { petPhotoUrl } from "@/lib/infra/storage";
import { lnPetStatusFromCompliance } from "@/lib/projections/pet-compliance";
import { speciesLabel } from "@/lib/utils/format";
import { likeContains } from "@/lib/utils/like-helpers";

import { IntentApplyBanner } from "./_components/IntentApplyBanner";
import { OwnerRollupStrip } from "./_components/OwnerRollupStrip";
import { PetSearchInput } from "./_components/PetSearchInput";

/**
 * Maximum pet rows rendered on this page.
 *
 * Owners with thousands of pets (high-volume rescue networks / shelters) would
 * produce an enormous DOM and exhaust server memory otherwise. The cap bounds
 * the listing; the name search (server-side ILIKE, same cap) is how an owner
 * narrows past it. Full pagination is tracked as a follow-up improvement.
 */
const MIS_MASCOTAS_LIMIT = 200;

export default async function MisMascotasPage({
  searchParams,
}: {
  searchParams: Promise<{ reclamado?: string; as?: string; q?: string }>;
}) {
  const { supabase, user } = await requireUserOrRedirect();

  // getProfileCached is warmed by (app)/layout.tsx in the same render pass.
  const profile = await getProfileCached(user.id);
  const params = await searchParams;
  const claimedCount = params.reclamado ? Number.parseInt(params.reclamado, 10) : null;
  const query = (params.q ?? "").trim();

  // Vets land at their org portal (or /cuenta if they have no org yet).
  // They can still access their pet list via direct sub-paths or `?as=owner`.
  if (profile?.role === "vet" && params.as !== "owner") {
    redirect(await resolveVetLanding(user.id));
  }

  const { data: authData } = await supabase.auth.getUser();
  const userEmail = (authData?.user?.email ?? "").toLowerCase();

  // Ownership scope + optional server-side name filter (drizzle `and` drops the
  // undefined when no query, so the unfiltered path is unchanged). The search is
  // server-side + bounded so it finds pets BEYOND the visible cap — the whole
  // point of the 200-cap notice's promised buscador.
  // Server-side name filter with an explicit ESCAPE clause — parity with
  // lib/infra/omnibox-search.ts. likeContains() backslash-escapes %/_ in the
  // user input; ESCAPE '\' tells Postgres to treat that backslash as the escape
  // char. drizzle's ilike() helper can't carry an ESCAPE clause, so this is a
  // raw sql predicate. and() drops it when the query is empty, so the unfiltered
  // path is unchanged.
  const nameFilter = query ? sql`${pets.name} ILIKE ${likeContains(query)} ESCAPE '\\'` : undefined;
  const ownedWhere = and(
    eq(ownerships.ownerUserId, user.id),
    isNull(ownerships.endedAt),
    nameFilter,
  );

  const [
    ownedPets,
    matchingTotal,
    pendingApplicationsCount,
    pendingTransfersCount,
    openWorkflows,
    previousWorkflows,
    reminders,
  ] = await Promise.all([
    db
      .select({
        pet: PET_CARD_SELECT,
        photo: PET_CARD_PHOTO_SELECT,
        ownershipRole: ownerships.role,
      })
      .from(pets)
      .innerJoin(ownerships, eq(ownerships.petId, pets.id))
      .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
      .where(ownedWhere)
      // Deterministic order so WHICH rows survive the cap isn't DB-order luck —
      // newest first, the same tiebreak fetchPetsForOwner uses. Final display
      // order is re-derived by urgency (sortedActivePets) below.
      .orderBy(desc(pets.createdAt))
      // Hard cap: prevents loading thousands of pet rows into JS for high-volume
      // owners. Full pagination is tracked as a follow-up improvement.
      .limit(MIS_MASCOTAS_LIMIT),
    // Count matching the SAME filter — so the cap notice reads honestly whether
    // or not a search is active ("showing N of M matching").
    db
      .select({ n: count() })
      .from(ownerships)
      .innerJoin(pets, eq(pets.id, ownerships.petId))
      .where(ownedWhere)
      .then((r) => Number(r[0]?.n ?? 0)),
    countPendingApplications(user.id),
    countPendingTransfers(user.id, userEmail),
    fetchOpenWorkflows(user.id),
    fetchPreviousWorkflows(user.id),
    fetchActiveReminders(user.id),
  ]);

  // Split into active (ok/registered/lost/pregnant) and deceased.
  const activePets = ownedPets.filter(({ pet }) => pet.status !== "deceased");
  const deceasedPets = ownedPets.filter(({ pet }) => pet.status === "deceased");

  // Same compliance projection the pet-profile header + carousel derive — the
  // card chip must agree with the detail header (one pet, one status truth).
  const complianceByPet = await fetchComplianceStatesForPets(
    user.id,
    activePets.map(({ pet }) => pet.id),
  );

  // Single status mapper shared with the carousel + pet profile
  // (lnPetStatusFromCompliance). The no-compliance fallback mirrors the
  // carousel exactly (lost -> lost, pregnant -> pregnant, else registered).
  const statusForPet = (pet: (typeof activePets)[number]["pet"]): LnPetStatus => {
    const compliance = complianceByPet.get(pet.id);
    if (compliance) {
      return lnPetStatusFromCompliance(
        { status: pet.status, pregnancyStatus: pet.pregnancyStatus ?? null },
        compliance,
      );
    }
    if (pet.status === "lost") return "lost";
    if (pet.pregnancyStatus === "in_progress") return "pregnant";
    return "registered";
  };

  // Urgency ordering — the SAME rank the credential carousel and the profile
  // swipe use (lib/domain/pet-urgency-rank.ts): Perdido → En tratamiento →
  // Preñada → Por vencer → Al día.
  const sortedActivePets = [...activePets].sort(
    (a, b) => petUrgencyRank(statusForPet(a.pet)) - petUrgencyRank(statusForPet(b.pet)),
  );

  // Rollup (decision 3): próximos vencimientos + al día + casos. Vencimientos
  // and casos are household-wide (dedicated bounded fetchers); "al día" is over
  // the shown active pets — for the common 1-8 pet owner that IS the household,
  // and under a search it honestly reflects the matched subset.
  const proximosVencimientos = countProximosReminders(reminders);
  const alDia = sortedActivePets.filter(({ pet }) => statusForPet(pet) === "ok").length;
  const openCases = openWorkflows.map(adaptWorkflow);
  const previousCases = previousWorkflows.map(adaptWorkflow);

  const isSearching = query.length > 0;
  const hasAnyOwned = matchingTotal > 0 || (!isSearching && ownedPets.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-8 py-7 pb-12">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Mis mascotas
          </h1>
          <p className="mt-1.5 text-md text-[var(--color-ln-mute)]">
            {activePets.length} activa{activePets.length === 1 ? "" : "s"}
            {deceasedPets.length > 0 && ` · ${deceasedPets.length} en memoria`}
          </p>
        </div>
        <Link href="/mis-mascotas/nueva">
          <LnButton variant="primary" size="md">
            + Inscribir mascota
          </LnButton>
        </Link>
      </div>

      {/* Claimed pets banner */}
      {claimedCount !== null && (
        <p className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-ln-ok)] bg-[var(--color-ln-ok-050)] px-3.5 py-2.5 text-sm text-[var(--color-ln-ok)]">
          {claimedCount > 0
            ? `Reclamaste ${claimedCount} mascota${claimedCount === 1 ? "" : "s"} adoptada${claimedCount === 1 ? "" : "s"} a tu cuenta.`
            : "Vinculamos tu DNI a tu cuenta. Si esperabas una adopción, pedile al refugio que verifique el DNI cargado."}
        </p>
      )}

      {/* Resume-application banner — for a pet you don't own yet (§9.2). */}
      <IntentApplyBanner />

      {/* ------------------------------------------------------------------ */}
      {/* Cross-pet rollup (decision 3, §9.1) — the "is anything on fire?"     */}
      {/* glance the swipe cannot give. Only when the owner has active pets.   */}
      {/* ------------------------------------------------------------------ */}
      {activePets.length > 0 && (
        <OwnerRollupStrip
          proximosVencimientos={proximosVencimientos}
          alDia={alDia}
          totalPets={activePets.length}
          casosAbiertos={openWorkflows.length}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Index — search + per-pet credential cards                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-4">
        <Suspense fallback={null}>
          <PetSearchInput initialQuery={query} />
        </Suspense>
      </div>

      {/* Scale guard notice — shown only when the (matching) list is capped. */}
      {ownedPets.length < matchingTotal && (
        <p className="mb-3.5 rounded-[var(--radius-sm)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-3.5 py-2.5 text-sm text-[var(--color-ln-azul)]">
          Mostrando {ownedPets.length} de {matchingTotal} mascotas. Afiná la búsqueda por nombre o
          accedé directamente desde la chapita o QR de cada mascota.
        </p>
      )}

      {activePets.length === 0 ? (
        isSearching ? (
          deceasedPets.length > 0 ? (
            // The search matched ONLY deceased pets — the In memoriam section
            // below shows them, so a bare "Sin resultados" would lie. Point the
            // owner at the matches instead of contradicting them.
            <LnEmptyState
              variant="dashed"
              title={`Sin resultados entre tus mascotas activas para "${query}".`}
              description="Hay coincidencias en In memoriam, más abajo."
            />
          ) : (
            <LnEmptyState
              variant="dashed"
              title={`Sin resultados para "${query}".`}
              description="Probá con otro nombre."
            />
          )
        ) : hasAnyOwned ? // Owner has only deceased pets — the In memoriam section below carries
        // them; don't show a "no pets" box that contradicts it.
        null : (
          <LnEmptyState
            variant="dashed"
            title="No tenés mascotas registradas."
            description="Cargá una mascota para verla acá."
            action={
              <Link href="/mis-mascotas/nueva">
                <LnButton variant="primary" size="sm">
                  Cargar una mascota
                </LnButton>
              </Link>
            }
          />
        )
      ) : (
        // List rows (PO ronda 4): the pet index reverts from cards to the
        // original registry list. Each live pet is one LnRegRow linking into its
        // credential; the index+inbox structure, search, memorial and rollup
        // (all P5 additions) stay — only the live-pet presentation reverts.
        <LnRegistry className="mb-8">
          {sortedActivePets.map(({ pet, photo, ownershipRole }) => {
            const status = statusForPet(pet);
            const breedLine = [
              pet.breed,
              pet.sex ? (pet.sex === "male" ? "Macho" : "Hembra") : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <LnRegRow
                key={pet.id}
                name={pet.name}
                status={status}
                breed={breedLine || undefined}
                species={speciesLabel(pet.species)}
                photoSrc={petPhotoUrl(photo?.storagePath) ?? undefined}
                photoSize={72}
                href={`/mis-mascotas/${pet.publicToken}`}
                nextLine={
                  isTransitRole(ownershipRole) ? (
                    <LnBadge variant="warning">En tránsito</LnBadge>
                  ) : undefined
                }
              />
            );
          })}
        </LnRegistry>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* In memoriam (decision 6) — deceased pets live HERE ONLY.             */}
      {/* ------------------------------------------------------------------ */}
      {deceasedPets.length > 0 && (
        <div className="mb-8">
          <LnSectionHead
            num="†"
            title="In memoriam"
            meta={`${deceasedPets.length} recordada${deceasedPets.length !== 1 ? "s" : ""}`}
          />
          <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-ln-paper">
            {deceasedPets.map(({ pet, photo }) => (
              <MemorialRow
                key={pet.id}
                name={pet.name}
                breed={pet.breed ?? undefined}
                href={`/mis-mascotas/${pet.publicToken}`}
                photoSrc={petPhotoUrl(photo?.storagePath) ?? undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Bandeja — the inbox for everything that isn't (yet) your pet (§9.2). */}
      {/* Anchor target for /cuenta/casos' redirect (/mis-mascotas#inbox).    */}
      {/* ================================================================== */}
      <section id="inbox" className="mt-8 scroll-mt-24">
        <LnSectionHead num="01" title="Bandeja" className="mb-4" />

        <div className="flex flex-col gap-5">
          {/* Open workflows — foster proposals, denuncias, custody, approvals.
              Self-empties with an explanatory line. */}
          <CasesWidget cases={openCases} title="Casos abiertos" />

          {/* Inbound transfers + adoption postulaciones — both about pets you
              do not own yet. hideWhenZero keeps transfers quiet at zero. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ActionLinkCard
              href="/mis-mascotas/postulaciones"
              icon="corazon"
              title="Mis postulaciones"
              description="Adopciones a las que te postulaste"
              badge={pendingApplicationsCount > 0 ? pendingApplicationsCount : null}
            />
            <ActionLinkCard
              href="/transferencias"
              icon="transferencia"
              title="Transferencias pendientes"
              description="Mascotas que alguien quiere transferirte"
              badge={pendingTransfersCount > 0 ? pendingTransfersCount : null}
              hideWhenZero
            />
          </div>

          {/* Closed-cases history — restored here (it lived on the removed
              /cuenta/casos via fetchPreviousWorkflows; P1 knowingly orphaned
              it until this inbox landed). Only when there is history. */}
          {previousCases.length > 0 && (
            <CasesWidget
              cases={previousCases}
              title="Historial"
              emptyText="Sin casos anteriores."
            />
          )}

          {/* Denunciar maltrato — about someone else's animal, so it can never
              live on your own credential (§9.2). The /inicio entry point lands
              here. */}
          <Link
            href="/denuncias/nueva"
            className="text-sm text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            + Denunciar maltrato animal
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Reclamar una mascota — routes to the existing ClaimWizard.           */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4">
          <h2 className="m-0 font-[var(--font-ln-serif)] text-lg font-semibold leading-tight text-[var(--color-ln-ink)]">
            Reclamar una mascota
          </h2>
          <p className="mt-1 text-md text-[var(--color-ln-mute)]">
            Tu mascota ya tiene chapita o microchip registrado. Ingresá el código de transferencia
            para reclamarla a tu cuenta.
          </p>
          <div className="mt-3">
            <Link href="/mis-mascotas/reclamar">
              <LnButton variant="primary" size="md">
                Reclamar con un código
              </LnButton>
            </Link>
          </div>
          <p className="mt-2 text-sm text-[var(--color-ln-faint)]">
            El titular actual debe confirmar la transferencia.
          </p>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MemorialRow({
  name,
  breed,
  href,
  photoSrc,
}: {
  name: string;
  breed?: string;
  href: string;
  photoSrc?: string;
}) {
  return (
    <a
      href={href}
      className="grid items-center gap-4 border-b border-[var(--color-ln-line-2)] px-5 py-[18px] text-inherit no-underline last:border-b-0 hover:bg-ln-stripe"
      style={{ gridTemplateColumns: "72px 1fr auto" }}
    >
      {/* Sepia photo */}
      <div
        className="relative h-[64px] w-[64px] flex-shrink-0 overflow-hidden rounded-full border border-[var(--color-ln-line-strong)]"
        style={{ filter: "grayscale(1) sepia(0.25) opacity(0.85)" }}
      >
        {photoSrc ? (
          <Image src={photoSrc} alt={name} fill sizes="64px" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(135deg,#e7e2d6_0_6px,#f3f0e7_6px_12px)]">
            <span className="font-[var(--font-ln-mono)] text-[7px] uppercase tracking-[.04em] text-[var(--color-ln-mute)]">
              foto
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0">
        <span className="font-[var(--font-ln-serif)] text-lg font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-memorial-sepia)]">
          {name}
        </span>
        {breed && <p className="mt-0.5 text-sm text-[var(--color-ln-mute)]">{breed}</p>}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 font-[var(--font-ln-mono)] text-sm whitespace-nowrap text-[var(--color-ln-mute)]">
        <span>Ver memorial</span>
        <span aria-hidden="true">›</span>
      </div>
    </a>
  );
}
