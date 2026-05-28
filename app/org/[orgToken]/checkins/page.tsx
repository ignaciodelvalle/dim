// Post-adoption check-in dashboard for the org side. Lists check-ins
// recorded by adopters AND open reminders for pets that were adopted via
// the active organization. Gated on adoption.review capability (placeholder
// in the catalog since slice 1 — this page gives it its first job).
//
// Companion to the cron in app/api/cron/post-adoption-checkin/route.ts and
// the owner-side form at /mis-mascotas/[token]/eventos/nuevo/checkin.

import { db, petEvents, pets, profiles, reminders } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function daysFromNow(dueAt: Date | string, now: Date): number {
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  return Math.round((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export default async function CheckinsPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  // Pre-validate membership. requireCapability below also checks, but we need
  // the organization.id to scope requireCapability to the right org.
  const { organization: orgFromToken } = await requireOrgAccessByToken(orgToken);
  const auth = await requireCapability("adoption.review", orgFromToken.id);
  if (auth.error !== null) {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-2xl mx-auto pt-8 space-y-4">
          <h1 className="text-2xl font-semibold">Sin acceso</h1>
          <p className="text-sm text-gob-text-gray ">{auth.error}</p>
          <Link href={`/org/${orgToken}`} className="text-sm text-gob-text-gray underline">
            ← Volver al panel
          </Link>
        </div>
      </main>
    );
  }
  const { organization } = auth;

  // Pet IDs adopted via this org. The JSON cast on payload->>X is the
  // canonical way to filter on payload fields in Postgres; the adoption
  // event's previous_owner_organization_id was denormalized there at
  // adoption time precisely so this query stays simple (no ownerships
  // history scan).
  const adoptedPetRows = await db
    .select({ petId: petEvents.petId })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.eventType, "adoption_finalized"),
        sql`${petEvents.payload}->>'previous_owner_organization_id' = ${organization.id}`,
      ),
    );
  const petIds = Array.from(new Set(adoptedPetRows.map((r) => r.petId)));

  // If nothing has been adopted out yet, there's nothing to dashboard. The
  // page still renders so the user has a stable entry point — the empty
  // state communicates "you'll see things here once you finalize adoptions".
  if (petIds.length === 0) {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-3xl mx-auto space-y-8">
          <PageHeader orgName={organization.displayName} />
          <p className="text-sm text-gob-text-muted">
            Todavía no hay adopciones registradas por esta organización. Cuando finalices una, los
            check-ins post-adopción del adoptante aparecerán acá.
          </p>
          <BackLink orgToken={orgToken} />
        </div>
      </main>
    );
  }

  // Recent check-ins received from adopters. Joined to pets for the name +
  // public token (CTA target) and to profiles via recordedByUserId for the
  // adopter display name.
  const recentCheckins = await db
    .select({
      eventId: petEvents.id,
      petId: petEvents.petId,
      petName: pets.name,
      publicToken: pets.publicToken,
      occurredAt: petEvents.occurredAt,
      notes: sql<string | null>`${petEvents.payload}->>'notes'`,
      adopterName: profiles.displayName,
    })
    .from(petEvents)
    .innerJoin(pets, eq(pets.id, petEvents.petId))
    .leftJoin(profiles, eq(profiles.id, petEvents.recordedByUserId))
    .where(and(eq(petEvents.eventType, "post_adoption_checkin"), inArray(petEvents.petId, petIds)))
    .orderBy(desc(petEvents.occurredAt))
    .limit(30);

  // Open reminders. Reminder.userId is the adopter; join to profiles gives
  // the display name. Split into overdue vs upcoming at render time.
  const openReminders = await db
    .select({
      reminderId: reminders.id,
      petId: reminders.petId,
      petName: pets.name,
      publicToken: pets.publicToken,
      dueAt: reminders.dueAt,
      title: reminders.title,
      adopterName: profiles.displayName,
    })
    .from(reminders)
    .innerJoin(pets, eq(pets.id, reminders.petId))
    .leftJoin(profiles, eq(profiles.id, reminders.userId))
    .where(
      and(
        eq(reminders.reminderType, "post_adoption_checkin"),
        inArray(reminders.petId, petIds),
        isNull(reminders.completedAt),
      ),
    )
    .orderBy(asc(reminders.dueAt))
    .limit(30);

  const now = new Date();
  const overdue = openReminders.filter((r) => new Date(r.dueAt).getTime() < now.getTime());
  const upcoming = openReminders.filter((r) => new Date(r.dueAt).getTime() >= now.getTime());

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-3xl mx-auto space-y-8">
        <PageHeader orgName={organization.displayName} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Vencidos <span className="text-sm text-gob-text-muted">({overdue.length})</span>
          </h2>
          {overdue.length === 0 ? (
            <p className="text-sm text-gob-text-muted">
              Ningún check-in vencido. Si el adoptante se atrasa, va a aparecer acá.
            </p>
          ) : (
            <ul className="divide-y divide-gob-border  rounded border border-gob-border ">
              {overdue.map((row) => {
                const days = -daysFromNow(row.dueAt, now);
                return (
                  <li
                    key={row.reminderId}
                    className="px-3 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium">
                        <Link
                          href={`/mis-mascotas/${row.publicToken}`}
                          className="underline underline-offset-2 hover:text-gob-text "
                        >
                          {row.petName}
                        </Link>{" "}
                        — {row.title}
                      </p>
                      <p className="text-xs text-gob-text-gray ">
                        Adoptante: {row.adopterName ?? "—"} · vencido hace {days}{" "}
                        {days === 1 ? "día" : "días"}
                      </p>
                    </div>
                    <span className="text-xs text-gob-warning-text  shrink-0">Vencido</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Próximos <span className="text-sm text-gob-text-muted">({upcoming.length})</span>
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gob-text-muted">No hay próximos check-ins en agenda.</p>
          ) : (
            <ul className="divide-y divide-gob-border  rounded border border-gob-border ">
              {upcoming.map((row) => {
                const days = daysFromNow(row.dueAt, now);
                return (
                  <li
                    key={row.reminderId}
                    className="px-3 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium">
                        <Link
                          href={`/mis-mascotas/${row.publicToken}`}
                          className="underline underline-offset-2 hover:text-gob-text "
                        >
                          {row.petName}
                        </Link>{" "}
                        — {row.title}
                      </p>
                      <p className="text-xs text-gob-text-gray ">
                        Adoptante: {row.adopterName ?? "—"} · en {days}{" "}
                        {days === 1 ? "día" : "días"} ({formatDate(row.dueAt)})
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Check-ins recibidos{" "}
            <span className="text-sm text-gob-text-muted">({recentCheckins.length})</span>
          </h2>
          {recentCheckins.length === 0 ? (
            <p className="text-sm text-gob-text-muted">Ningún check-in registrado todavía.</p>
          ) : (
            <ul className="divide-y divide-gob-border  rounded border border-gob-border ">
              {recentCheckins.map((row) => (
                <li key={row.eventId} className="px-3 py-3 space-y-1">
                  <p className="text-sm font-medium">
                    <Link
                      href={`/mis-mascotas/${row.publicToken}`}
                      className="underline underline-offset-2 hover:text-gob-text "
                    >
                      {row.petName}
                    </Link>
                  </p>
                  <p className="text-xs text-gob-text-gray ">
                    {row.adopterName ?? "Adoptante"} · {formatDate(row.occurredAt)}
                  </p>
                  {row.notes && (
                    <p className="text-xs italic text-gob-text-gray  pt-1">"{row.notes}"</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <BackLink orgToken={orgToken} />
      </div>
    </main>
  );
}

function PageHeader({ orgName }: { orgName: string }) {
  return (
    <header className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-gob-text-muted">
        Seguimiento · {orgName}
      </p>
      <h1 className="text-3xl font-semibold">Check-ins post-adopción</h1>
      <p className="text-sm text-gob-text-gray ">
        Los adoptantes se autoreportan en las ventanas pactadas. Acá ves lo que llegó, lo que está
        por venir y lo que no llegó a tiempo.
      </p>
    </header>
  );
}

function BackLink({ orgToken }: { orgToken: string }) {
  return (
    <footer className="pt-4 border-t border-gob-border ">
      <Link href={`/org/${orgToken}`} className="text-sm text-gob-text-gray underline ">
        ← Volver al panel
      </Link>
    </footer>
  );
}
