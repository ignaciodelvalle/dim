import { recordPostAdoptionCheckinAction } from "@/app/actions/checkin";
import { db, petEvents, reminders } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckinForm } from "./CheckinForm";

// Post-adoption check-in is the OWNER's self-report surface. Gated to:
//   (1) owner-path access (org-side members can READ the resulting event
//       via slice-7 cohabitation but must not WRITE the check-in);
//   (2) an adoption_finalized event exists for the pet AND the adopter
//       in the payload is the current user;
//   (3) at least one open post_adoption_checkin reminder is pending —
//       otherwise the page would let an over-eager adopter spam the
//       refugio with off-window check-ins.

export default async function PostAdoptionCheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<{ notes?: string }>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const access = await requirePetAccess(publicToken);
  if (!access.ok) {
    if (access.error === "Sesión expirada.") redirect("/login");
    notFound();
  }
  // Check-in is owner-self only. Org-mediated access (refugios cohabiting
  // post-adoption) can READ the resulting event but not WRITE it.
  if (access.accessPath !== "owner") notFound();
  const { user, pet } = access;

  const [adoption] = await db
    .select({ payload: petEvents.payload })
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "adoption_finalized")))
    .orderBy(desc(petEvents.occurredAt))
    .limit(1);

  const adopterId = (adoption?.payload as { adopter_user_id?: string } | undefined)
    ?.adopter_user_id;
  if (!adoption || adopterId !== user.id) notFound();

  const [openReminder] = await db
    .select({ id: reminders.id, dueAt: reminders.dueAt })
    .from(reminders)
    .where(
      and(
        eq(reminders.petId, pet.id),
        eq(reminders.userId, user.id),
        eq(reminders.reminderType, "post_adoption_checkin"),
        isNull(reminders.completedAt),
      ),
    )
    .orderBy(reminders.dueAt)
    .limit(1);

  if (!openReminder) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-md mx-auto pt-8 space-y-6">
          <Link
            href={`/mis-mascotas/${pet.publicToken}`}
            className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Volver al perfil
          </Link>
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Sin check-ins pendientes
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {pet.name} no tiene un check-in post-adopción pendiente en este momento. Si el refugio
              te pide otro seguimiento más adelante, te vamos a avisar.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const boundAction = recordPostAdoptionCheckinAction.bind(null, pet.publicToken);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/mis-mascotas/${pet.publicToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver al perfil
        </Link>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Check-in post-adopción
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            El refugio que te confió a {pet.name} está esperando este seguimiento. Llevá un minuto:
            contales cómo está, sumá una foto si querés.
          </p>
        </div>
        <CheckinForm action={boundAction} defaults={{ notes: sp.notes ?? null }} />
      </div>
    </main>
  );
}
