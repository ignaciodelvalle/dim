// Use-case: snoozeReminderAction — posponer un recordatorio (strangler migration 42/61).
//
// Snooze cap: 3 × 7 days, then a single 30-day snooze (no further increment).
//   snooze_count < 3  → snoozed_until = now + 7d, snooze_count++
//   snooze_count >= 3 → snoozed_until = now + 30d, snooze_count stays at 3

import { db, reminders } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { and, eq } from "drizzle-orm";

import type { SnoozeReminderResult } from "./types";

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
