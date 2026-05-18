// Vet professional portal (/pro). Role-gated to profile.role === 'vet'.
// Non-vets are redirected to their role-appropriate landing page via pathForRole.

import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import Link from "next/link";

import {
  db,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  reminders,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { eventTypeLabel, formatDate, speciesLabel } from "@/lib/format";
import { pathForRole } from "@/lib/role-landing";
import { redirect } from "next/navigation";

// ============================================================================
// Labels
// ============================================================================

const OWNERSHIP_ROLE_LABELS: Record<string, string> = {
  co_owner: "Co-titular",
  caretaker: "Cuidador/a",
  foster: "Tránsito",
};

const ORG_MEMBERSHIP_ROLE_LABELS: Record<string, string> = {
  admin: "Administrador/a",
  coordinator: "Coordinador/a",
  member: "Miembro",
  volunteer: "Voluntario/a",
  foster: "Tránsito",
  vet_individual: "Veterinario/a",
};

// ============================================================================
// Page
// ============================================================================

export default async function ProPortalPage() {
  const { user } = await requireUserOrRedirect();

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.role !== "vet") {
    // Redirect to the correct landing for their actual role.
    redirect(pathForRole(profile?.role ?? "owner", false));
  }

  const vetId = user.id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ── Section 1: Pets where this vet holds a non-owner custody role ────────
  const sharedCustodyPets = await db
    .select({ pet: pets, ownershipRole: ownerships.role })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .where(
      and(
        eq(ownerships.ownerUserId, vetId),
        isNull(ownerships.endedAt),
        inArray(ownerships.role, ["co_owner", "caretaker", "foster"]),
      ),
    );

  // ── Section 2: Pets treated in the last 30 days ─────────────────────────
  // Distinct pets where this vet has authored events with author_role='vet' in
  // the last 30 days, ordered by most recent treatment descending (limit 20).
  const recentTreatmentRows = await db
    .select({
      petId: petEvents.petId,
      lastEventAt: petEvents.occurredAt,
      eventType: petEvents.eventType,
    })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.recordedByUserId, vetId),
        eq(petEvents.authorRole, "vet"),
        gte(petEvents.occurredAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(petEvents.occurredAt));

  // Collapse to one row per pet (the most recent event).
  const seenPetIds30 = new Set<string>();
  const recentTreatments: { petId: string; lastEventAt: Date; eventType: string }[] = [];
  for (const row of recentTreatmentRows) {
    if (seenPetIds30.has(row.petId)) continue;
    if (recentTreatments.length >= 20) break;
    seenPetIds30.add(row.petId);
    recentTreatments.push({
      petId: row.petId,
      lastEventAt: row.lastEventAt,
      eventType: row.eventType,
    });
  }

  // Fetch pet details for section 2.
  const recentPetIds = recentTreatments.map((r) => r.petId);
  const recentPetsMap = new Map<string, typeof pets.$inferSelect>();
  if (recentPetIds.length > 0) {
    const rows = await db
      .select()
      .from(pets)
      .where(inArray(pets.id, recentPetIds));
    for (const p of rows) {
      recentPetsMap.set(p.id, p);
    }
  }

  // ── Section 3: Upcoming reminders (30 days) for recently-treated pets ───
  // "Eligible" pets = vet authored at least one event in the last 90 days.
  const eligibleEventRows = await db
    .select({ petId: petEvents.petId })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.recordedByUserId, vetId),
        eq(petEvents.authorRole, "vet"),
        gte(petEvents.occurredAt, ninetyDaysAgo),
      ),
    );

  const eligiblePetIds = [...new Set(eligibleEventRows.map((r) => r.petId))];

  const upcomingReminders: {
    petId: string;
    petName: string;
    petSpecies: string;
    reminderTitle: string;
    dueAt: Date;
  }[] = [];

  if (eligiblePetIds.length > 0) {
    const reminderRows = await db
      .select({
        petId: reminders.petId,
        title: reminders.title,
        dueAt: reminders.dueAt,
        petName: pets.name,
        petSpecies: pets.species,
      })
      .from(reminders)
      .innerJoin(pets, eq(pets.id, reminders.petId))
      .where(
        and(
          inArray(reminders.petId, eligiblePetIds),
          gte(reminders.dueAt, now),
          lte(reminders.dueAt, thirtyDaysFromNow),
          isNull(reminders.completedAt),
        ),
      )
      .orderBy(reminders.dueAt)
      .limit(20);

    for (const r of reminderRows) {
      upcomingReminders.push({
        petId: r.petId,
        petName: r.petName,
        petSpecies: r.petSpecies,
        reminderTitle: r.title,
        dueAt: r.dueAt,
      });
    }
  }

  // ── Section 4: Active org memberships ───────────────────────────────────
  const memberships = await db
    .select({
      membershipRole: organizationMemberships.role,
      orgDisplayName: organizations.displayName,
      orgPublicToken: organizations.publicToken,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, vetId),
        isNull(organizationMemberships.leftAt),
      ),
    );

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      {/* Cross-portal nav rail */}
      <nav className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-2">
        <div className="max-w-3xl mx-auto flex items-center gap-4 text-sm text-neutral-600 dark:text-neutral-400">
          <Link
            href="/mis-mascotas"
            className="hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            Mis mascotas
          </Link>
          <span className="text-neutral-300 dark:text-neutral-700" aria-hidden>
            ·
          </span>
          <Link
            href="/cuenta"
            className="hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
          >
            Mi cuenta
          </Link>
        </div>
      </nav>

      <div className="p-6">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Page header */}
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-neutral-500">Portal profesional</p>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Hola, {profile.displayName}
            </h1>
            {profile.matriculaNumber && (
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                Matr. M.N. {profile.matriculaNumber}
                {profile.matriculaVerified && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                    verificada
                  </span>
                )}
              </p>
            )}
          </header>

          {/* ── Section 1: Shared custody ───────────────────────────────── */}
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Mis mascotas (cuidado compartido o temporal)
            </h2>
            {sharedCustodyPets.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                No tenés mascotas bajo cuidado compartido o temporal por ahora.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {sharedCustodyPets.map(({ pet, ownershipRole }) => (
                  <li key={pet.id}>
                    <Link
                      href={`/mis-mascotas/${pet.publicToken}`}
                      className="flex items-center justify-between py-3 gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 -mx-1 px-1 rounded transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                          {pet.name}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-500">
                          {speciesLabel(pet.species)} · {pet.publicToken}
                        </p>
                      </div>
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800">
                        {OWNERSHIP_ROLE_LABELS[ownershipRole] ?? ownershipRole}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Section 2: Recently treated pets (30 days) ──────────────── */}
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Mascotas tratadas recientemente (30 días)
            </h2>
            {recentTreatments.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                Aún no registraste atenciones en los últimos 30 días.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {recentTreatments.map(({ petId, lastEventAt, eventType }) => {
                  const pet = recentPetsMap.get(petId);
                  if (!pet) return null;
                  return (
                    <li key={petId}>
                      <Link
                        href={`/mis-mascotas/${pet.publicToken}`}
                        className="flex items-center justify-between py-3 gap-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 -mx-1 px-1 rounded transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                            {pet.name}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-500">
                            {speciesLabel(pet.species)} · {eventTypeLabel(eventType)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-500">
                          {formatDate(lastEventAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Section 3: Upcoming reminders (30 days) ─────────────────── */}
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Próximas citas (30 días)
            </h2>
            {upcomingReminders.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                No hay recordatorios próximos para tus pacientes.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {upcomingReminders.map((r, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable order from DB
                  <li key={`${r.petId}-${r.dueAt.toISOString()}-${idx}`}>
                    <div className="flex items-center justify-between py-3 gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                          {r.petName}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-500 truncate">
                          {speciesLabel(r.petSpecies)} · {r.reminderTitle}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-500">
                        {formatDate(r.dueAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Section 4: Org memberships ──────────────────────────────── */}
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
              Tu trabajo en organizaciones
            </h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-500">
                Todavía no te uniste a ningún refugio o clínica.{" "}
                <Link
                  href="/cuenta/upgrade"
                  className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
                >
                  Sumate a una organización
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {memberships.map((m) => (
                  <li
                    key={m.orgPublicToken}
                    className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 dark:border-neutral-800 p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                        {m.orgDisplayName}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        {ORG_MEMBERSHIP_ROLE_LABELS[m.membershipRole] ?? m.membershipRole}
                      </p>
                    </div>
                    <Link
                      href={`/org/${m.orgPublicToken}`}
                      className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors text-neutral-700 dark:text-neutral-300"
                    >
                      Ir al panel
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Section 5: Quick navigation ─────────────────────────────── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              Navegación rápida
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/mis-mascotas"
                className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
              >
                Mis mascotas (como dueño)
              </Link>
              <Link
                href="/cuenta"
                className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
              >
                Mi cuenta
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
