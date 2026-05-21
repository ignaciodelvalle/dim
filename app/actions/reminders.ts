"use server";

// Server actions for owner-managed reminders. Today only vaccine reminders
// have a UI; medication / appointment / custom share the schema but are not
// yet exposed in the owner PWA.

import { db, reminders } from "@/db";
import { parseDateInput } from "@/lib/format";
import { requireOwnedPetByToken } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type ReminderFormState = {
  error: string | null;
};

export async function createVaccineReminderAction(
  publicToken: string,
  _previous: ReminderFormState,
  formData: FormData,
): Promise<ReminderFormState> {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) return { error: "Sesión expirada." };
  const { user, pet } = session;

  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!dueAtRaw) return { error: "Falta la fecha estimada." };

  const dueAt = parseDateInput(dueAtRaw);
  if (!dueAt) return { error: "Fecha inválida." };

  try {
    await db.insert(reminders).values({
      petId: pet.id,
      userId: user.id,
      reminderType: "vaccine",
      dueAt,
      title: vaccineName,
      description,
    });
  } catch (err) {
    return {
      error: `No se pudo crear el recordatorio: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

export async function deleteVaccineReminderAction(publicToken: string, reminderId: string) {
  const session = await requireOwnedPetByToken(publicToken);
  if (!session) {
    throw new Error("No autorizado.");
  }
  const { pet } = session;

  await db.delete(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.petId, pet.id)));

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// snoozeReminderAction — posponer un recordatorio (spec §E)
// ---------------------------------------------------------------------------
// Snooze cap: 3 × 7 days, then a single 30-day snooze (no further increment).
//   snooze_count < 3  → snoozed_until = now + 7d, snooze_count++
//   snooze_count >= 3 → snoozed_until = now + 30d, snooze_count stays at 3

export type SnoozeReminderResult =
  | { ok: true; snoozedUntil: string; snoozeCount: number }
  | { ok: false; error: string };

export async function snoozeReminderAction(reminderId: string): Promise<SnoozeReminderResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada." };

  // Fetch the reminder and verify ownership in one shot.
  const [existing] = await db
    .select({ id: reminders.id, snoozeCount: reminders.snoozeCount })
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, user.id)))
    .limit(1);

  if (!existing) return { ok: false, error: "No autorizado." };

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const now = new Date();
  const isCapped = existing.snoozeCount >= 3;
  const snoozeMs = isCapped ? 30 * MS_PER_DAY : 7 * MS_PER_DAY;
  const nextSnoozedUntil = new Date(now.getTime() + snoozeMs);
  const nextSnoozeCount = isCapped ? existing.snoozeCount : existing.snoozeCount + 1;

  const [updated] = await db
    .update(reminders)
    .set({ snoozedUntil: nextSnoozedUntil, snoozeCount: nextSnoozeCount })
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, user.id)))
    .returning({ snoozedUntil: reminders.snoozedUntil, snoozeCount: reminders.snoozeCount });

  if (!updated) return { ok: false, error: "No se pudo posponer el recordatorio." };

  // snoozedUntil cannot be null here — we just set it to nextSnoozedUntil.
  // The optional-chain return type satisfies the union but we know it's non-null.
  const snoozedUntilDate = updated.snoozedUntil ?? nextSnoozedUntil;
  return {
    ok: true,
    snoozedUntil: snoozedUntilDate.toISOString(),
    snoozeCount: updated.snoozeCount,
  };
}
