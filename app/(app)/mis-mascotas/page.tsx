// Mis Mascotas — Libreta Nacional redesign.
//
// Layout: header (serif h1 + "Inscribir mascota" primary button) →
//   registry rows (LnRegRow, larger variant 72px) → In memoriam section (†)
//   with deceased pet rows in sepia.
//
// Existing data fetching, ownership query, vet redirect, and action cards
// (reclamar, postulaciones, transferencias) are all preserved unchanged.

import { ActionLinkCard } from "@/components/ActionLinkCard";
import { isTransitRole } from "@/components/PetCard.helpers";
import { LnBadge } from "@/components/ui/Badge";
import { LnButton } from "@/components/ui/Button";
import type { LnPetStatus } from "@/components/ui/Chip";
import { LnSectionHead } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { LnPetPhoto, LnRegRow, LnRegistry } from "@/components/ui/RegRow";
import { LnStatusFlag } from "@/components/ui/StatusFlag";
import { attachments, db, ownerships, pets } from "@/db";
import {
  countPendingApplications,
  countPendingTransfers,
  fetchComplianceStatesForPets,
} from "@/lib/analytics/owner-dashboard";
import { petUrgencyRank } from "@/lib/domain/pet-urgency-rank";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { PET_CARD_PHOTO_SELECT, PET_CARD_SELECT } from "@/lib/infra/pet-projections";
import { getProfileCached } from "@/lib/infra/request-cache";
import { resolveVetLanding } from "@/lib/infra/role-landing";
import { petPhotoUrl } from "@/lib/infra/storage";
import { lnPetStatusFromCompliance } from "@/lib/projections/pet-compliance";
import { speciesLabel } from "@/lib/utils/format";
import { and, count, eq, isNull } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

/**
 * Maximum pet rows rendered on this page.
 *
 * Owners with thousands of pets (high-volume rescue networks / shelters) would
 * produce an enormous DOM and exhaust server memory otherwise. For now we cap
 * the listing and show a "showing N of M" notice. Full pagination is tracked
 * as a follow-up improvement.
 */
const MIS_MASCOTAS_LIMIT = 200;
import { redirect } from "next/navigation";

export default async function MisMascotasPage({
  searchParams,
}: {
  searchParams: Promise<{ reclamado?: string; as?: string }>;
}) {
  const { supabase, user } = await requireUserOrRedirect();

  // getProfileCached is warmed by (app)/layout.tsx in the same render pass.
  const profile = await getProfileCached(user.id);
  const params = await searchParams;
  const claimedCount = params.reclamado ? Number.parseInt(params.reclamado, 10) : null;

  // Vets land at their org portal (or /cuenta if they have no org yet).
  // They can still access their pet list via direct sub-paths or `?as=owner`.
  if (profile?.role === "vet" && params.as !== "owner") {
    redirect(await resolveVetLanding(user.id));
  }

  const { data: authData } = await supabase.auth.getUser();
  const userEmail = (authData?.user?.email ?? "").toLowerCase();

  const [ownedPets, totalPetsCount, pendingApplicationsCount, pendingTransfersCount] =
    await Promise.all([
      db
        .select({
          pet: PET_CARD_SELECT,
          photo: PET_CARD_PHOTO_SELECT,
          ownershipRole: ownerships.role,
        })
        .from(pets)
        .innerJoin(ownerships, eq(ownerships.petId, pets.id))
        .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
        .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt)))
        // Hard cap: prevents loading thousands of pet rows into JS for high-volume
        // owners. Full pagination is tracked as a follow-up improvement.
        .limit(MIS_MASCOTAS_LIMIT),
      db
        .select({ n: count() })
        .from(ownerships)
        .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt)))
        .then((r) => Number(r[0]?.n ?? 0)),
      countPendingApplications(user.id),
      countPendingTransfers(user.id, userEmail),
    ]);

  // Split into active (ok/registered/lost/pregnant) and deceased
  const activePets = ownedPets.filter(({ pet }) => pet.status !== "deceased");
  const deceasedPets = ownedPets.filter(({ pet }) => pet.status === "deceased");

  // Same compliance projection the pet-profile header derives — the list chip
  // must agree with the detail header (QA round 2 2026-07-03 #4: one pet,
  // three status truths). AL DÍA only when every obligation is verified-ok.
  const complianceByPet = await fetchComplianceStatesForPets(
    user.id,
    activePets.map(({ pet }) => pet.id),
  );

  // Single status mapper shared with the carousel + pet profile
  // (lnPetStatusFromCompliance) so a pet's chip never disagrees across surfaces.
  const statusForPet = (pet: (typeof activePets)[number]["pet"]): LnPetStatus => {
    const compliance = complianceByPet.get(pet.id);
    return compliance
      ? lnPetStatusFromCompliance(
          { status: pet.status, pregnancyStatus: pet.pregnancyStatus ?? null },
          compliance,
        )
      : "registered";
  };

  // Urgency ordering (handoff 2b.2): Perdido → En tratamiento → Preñada →
  // Por vencer (registered/pending) → Al día → Registrada. The SAME rank the
  // credential carousel uses on /inicio and the profile carousel will use
  // (owner-ia-redesign P4) — shared in lib/domain/pet-urgency-rank.ts.
  const sortedActivePets = [...activePets].sort(
    (a, b) => petUrgencyRank(statusForPet(a.pet)) - petUrgencyRank(statusForPet(b.pet)),
  );

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
          <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
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
        <p className="mb-[18px] rounded-[var(--radius-sm)] border border-[var(--color-ln-ok)] bg-[var(--color-ln-ok-050)] px-3.5 py-2.5 text-[13px] text-[var(--color-ln-ok)]">
          {claimedCount > 0
            ? `Reclamaste ${claimedCount} mascota${claimedCount === 1 ? "" : "s"} adoptada${claimedCount === 1 ? "" : "s"} a tu cuenta.`
            : "Vinculamos tu DNI a tu cuenta. Si esperabas una adopción, pedile al refugio que verifique el DNI cargado."}
        </p>
      )}

      {/* Scale guard notice — shown only when the list is capped */}
      {ownedPets.length < totalPetsCount && (
        <p className="mb-3.5 rounded-[var(--radius-sm)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-3.5 py-2.5 text-[12.5px] text-[var(--color-ln-azul)]">
          Mostrando {ownedPets.length} de {totalPetsCount} mascotas. Para ver más usá el buscador o
          accedé directamente desde la chapita o QR de cada mascota.
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Active pets registry                                                */}
      {/* ------------------------------------------------------------------ */}
      {activePets.length === 0 ? (
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
      ) : (
        <LnRegistry className="mb-8">
          {sortedActivePets.map(({ pet, photo, ownershipRole }) => {
            const st = statusForPet(pet);
            const isTransit = isTransitRole(ownershipRole);
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
                status={st}
                breed={breedLine || undefined}
                species={speciesLabelShort(pet.species)}
                photoSrc={petPhotoUrl(photo?.storagePath) ?? undefined}
                photoSize={72}
                href={`/mis-mascotas/${pet.publicToken}`}
                nextLine={isTransit ? <LnBadge variant="warning">En tránsito</LnBadge> : undefined}
              />
            );
          })}
        </LnRegistry>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* In memoriam                                                          */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Reclamar una mascota — promoted card (handoff 2b.4). PO Q3: a richer */}
      {/* inline card that ROUTES to the existing ClaimWizard, rather than     */}
      {/* duplicating the claim-code validation here.                          */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-8">
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4">
          <h2 className="m-0 font-[var(--font-ln-serif)] text-[var(--text-lg)] font-semibold leading-tight text-[var(--color-ln-ink)]">
            Reclamar una mascota
          </h2>
          <p className="mt-1 text-[var(--text-md)] text-[var(--color-ln-mute)]">
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
          <p className="mt-2 text-[var(--text-sm)] text-[var(--color-ln-faint)]">
            El titular actual debe confirmar la transferencia.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* More actions                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-8 border-t border-[var(--color-ln-line)] pt-6">
        <p className="mb-3.5 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.12em] text-[var(--color-ln-mute)]">
          Más acciones
        </p>
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
        {breed && <p className="mt-0.5 text-[12.5px] text-[var(--color-ln-mute)]">{breed}</p>}
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 font-[var(--font-ln-mono)] text-[11px] whitespace-nowrap text-[var(--color-ln-mute)]">
        <span>Ver memorial</span>
        <span aria-hidden="true">›</span>
      </div>
    </a>
  );
}

/**
 * Short species display name for the right column of each row. Dog/cat keep the
 * adjectival "especie" form (Canina/Felina) used on the libreta; every other
 * species falls through to the shared es-AR label map so the raw English enum
 * (rabbit, guinea_pig, ferret) never leaks into the UI.
 */
function speciesLabelShort(species: string): string {
  switch (species) {
    case "dog":
      return "Canina";
    case "cat":
      return "Felina";
    default:
      return speciesLabel(species);
  }
}
