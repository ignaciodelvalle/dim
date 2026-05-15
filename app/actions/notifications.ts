"use server";

// Notification server actions. Each one verifies ownership against the
// authenticated user's id — a notification belongs to exactly one user, and
// nobody else can read or mutate it.

import { db, notifications } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada");
  return user;
}

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)));
  revalidatePath("/notificaciones");
  revalidatePath("/mis-mascotas");
}

export async function archiveNotificationAction(notificationId: string): Promise<void> {
  const user = await requireUser();
  const now = new Date();
  await db
    .update(notifications)
    .set({ archivedAt: now, readAt: now })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, user.id)));
  revalidatePath("/notificaciones");
  revalidatePath("/mis-mascotas");
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notificaciones");
  revalidatePath("/mis-mascotas");
}
