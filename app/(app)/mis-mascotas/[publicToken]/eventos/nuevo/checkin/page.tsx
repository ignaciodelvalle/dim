import { recordPostAdoptionCheckinAction } from "@/app/actions/checkin";
import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";
import { db, petEvents, reminders } from "@/db";
import { requirePetAccess } from "@/lib/infra/pet-access";
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
  searchParams: Promise<{ notes?: string; autoconfirm?: string }>;
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
      <LnSheetWrap>
        <LnSheetCard>
          <div className="px-[18px] py-6 space-y-[10px]">
            <p className="font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink)]">
              Sin check-ins pendientes
            </p>
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              {pet.name} no tiene un check-in post-adopción pendiente en este momento. Si el refugio
              te pide otro seguimiento más adelante, te vamos a avisar.
            </p>
            <Link
              href={`/mis-mascotas/${pet.publicToken}`}
              className="inline-block font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] underline underline-offset-2"
            >
              ← Volver al perfil
            </Link>
          </div>
        </LnSheetCard>
      </LnSheetWrap>
    );
  }

  const boundAction = recordPostAdoptionCheckinAction.bind(null, pet.publicToken);

  return (
    <LnSheetWrap>
      <LnSheetCard>
        <CheckinForm
          action={boundAction}
          defaults={{ notes: sp.notes ?? null }}
          autoConfirm={sp.autoconfirm === "1"}
        />
      </LnSheetCard>
    </LnSheetWrap>
  );
}
