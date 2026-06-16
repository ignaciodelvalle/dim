// Mis Mascotas — Libreta Nacional redesign.
//
// Layout: header (serif h1 + "Inscribir mascota" primary button) →
//   registry rows (LnRegRow, larger variant 72px) → In memoriam section (†)
//   with deceased pet rows in sepia.
//
// Existing data fetching, ownership query, vet redirect, and action cards
// (reclamar, postulaciones, transferencias) are all preserved unchanged.

import { ActionLinkCard } from "@/components/ActionLinkCard";
import { LnBadge } from "@/components/ui/Badge";
import { LnButton } from "@/components/ui/Button";
import { LnSectionHead } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { LnPetPhoto, LnRegRow, LnRegistry } from "@/components/ui/RegRow";
import { LnStatusFlag } from "@/components/ui/StatusFlag";
import { attachments, db, ownerships, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import {
  countPendingApplications,
  countPendingTransfers,
  fetchActiveReminders,
} from "@/lib/owner-dashboard";
import { PET_CARD_PHOTO_SELECT, PET_CARD_SELECT } from "@/lib/pet-projections";
import { getProfileCached } from "@/lib/request-cache";
import { resolveVetLanding } from "@/lib/role-landing";
import { petPhotoUrl } from "@/lib/storage";
import type { ReminderVariant } from "@/lib/vaccine-reminder-state";
import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
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

  const [ownedPets, activeReminders, pendingApplicationsCount, pendingTransfersCount] =
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
        .where(and(eq(ownerships.ownerUserId, user.id), isNull(ownerships.endedAt))),
      fetchActiveReminders(user.id),
      countPendingApplications(user.id),
      countPendingTransfers(user.id, userEmail),
    ]);

  // Highest-priority reminder variant per pet (for status dot derivation)
  const reminderVariantByPet = new Map<string, ReminderVariant>();
  for (const r of activeReminders) {
    if (!reminderVariantByPet.has(r.petId)) {
      reminderVariantByPet.set(r.petId, r.variant);
    }
  }

  /** Derive the LnPetStatus from the pet row + reminders. */
  function lnStatus(
    petStatus: string,
    petId: string,
    pregnancyStatus: string | null,
  ): "ok" | "sick" | "lost" | "pregnant" {
    if (petStatus === "lost") return "lost";
    if (pregnancyStatus === "in_progress") return "pregnant";
    const rv = reminderVariantByPet.get(petId);
    if (rv === "overdue_critical" || rv === "overdue" || rv === "due_soon") return "sick";
    return "ok";
  }

  // Split into active (ok/sick/lost/pregnant) and deceased
  const activePets = ownedPets.filter(({ pet }) => pet.status !== "deceased");
  const deceasedPets = ownedPets.filter(({ pet }) => pet.status === "deceased");

  return (
    <div className="mx-auto max-w-4xl px-[32px] py-[28px] pb-[48px]">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-[24px] flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Mis mascotas
          </h1>
          <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
            Cada una con su libreta sanitaria nacional.
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
        <p className="mb-[18px] rounded-[4px] border border-[var(--color-ln-ok)] bg-[var(--color-ln-ok-050)] px-[14px] py-[10px] text-[13px] text-[var(--color-ln-ok)]">
          {claimedCount > 0
            ? `Reclamaste ${claimedCount} mascota${claimedCount === 1 ? "" : "s"} adoptada${claimedCount === 1 ? "" : "s"} a tu cuenta.`
            : "Vinculamos tu DNI a tu cuenta. Si esperabas una adopción, pedile al refugio que verifique el DNI cargado."}
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Active pets registry                                                */}
      {/* ------------------------------------------------------------------ */}
      {activePets.length === 0 ? (
        <LnEmptyState
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
        <LnRegistry className="mb-[32px]">
          {activePets.map(({ pet, photo, ownershipRole }) => {
            const st = lnStatus(pet.status, pet.id, pet.pregnancyStatus ?? null);
            const isTransit = ownershipRole === "shelter_custody";
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
        <div className="mb-[32px]">
          <LnSectionHead
            num="†"
            title="In memoriam"
            meta={`${deceasedPets.length} recordada${deceasedPets.length !== 1 ? "s" : ""}`}
          />
          <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] bg-ln-paper">
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
      {/* More actions                                                         */}
      {/* ------------------------------------------------------------------ */}
      <section className="mt-[32px] border-t border-[var(--color-ln-line)] pt-[24px]">
        <p className="mb-[14px] font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.12em] text-[var(--color-ln-mute)]">
          Más acciones
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionLinkCard
            href="/mis-mascotas/reclamar"
            icon="qr"
            title="Reclamar mascota existente"
            description="Tu mascota ya tiene chapita o microchip registrado"
          />
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
      className="grid items-center gap-[16px] border-b border-[var(--color-ln-line-2)] px-[20px] py-[18px] text-inherit no-underline last:border-b-0 hover:bg-ln-stripe"
      style={{ gridTemplateColumns: "72px 1fr auto" }}
    >
      {/* Sepia photo */}
      <div
        className="relative h-[64px] w-[64px] flex-shrink-0 overflow-hidden rounded-full border border-[var(--color-ln-line-strong)]"
        style={{ filter: "grayscale(1) sepia(0.25) opacity(0.85)" }}
      >
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc} alt={name} className="absolute inset-0 h-full w-full object-cover" />
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
        <span className="font-[var(--font-ln-serif)] text-[18px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-memorial-sepia)]">
          {name}
        </span>
        {breed && <p className="mt-[2px] text-[12.5px] text-[var(--color-ln-mute)]">{breed}</p>}
      </div>

      {/* Right */}
      <div className="flex items-center gap-[6px] font-[var(--font-ln-mono)] text-[11px] whitespace-nowrap text-[var(--color-ln-mute)]">
        <span>Ver memorial</span>
        <span aria-hidden="true">›</span>
      </div>
    </a>
  );
}

/** Short species display name for the right column of each row. */
function speciesLabelShort(species: string): string {
  switch (species) {
    case "dog":
      return "Canina";
    case "cat":
      return "Felina";
    default:
      return species;
  }
}
