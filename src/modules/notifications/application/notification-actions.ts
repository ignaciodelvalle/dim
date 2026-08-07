// Use-case: notification-actions — mark read, archive, mark all read (strangler migration 59/61).
//
// Auth moved to the shim wrapper (app/actions/notifications.ts). Each function
// now receives the already-authenticated userId directly so authentication is
// not duplicated and the use-case stays pure.
//
// Each function enforces ownership: a notification belongs to exactly one user,
// and the WHERE clause always scopes updates to that user's rows.

import { db, notifications } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  revalidatePath("/notificaciones");
  revalidatePath("/mis-mascotas");
}

export async function archiveNotification(userId: string, notificationId: string): Promise<void> {
  const now = new Date();
  await db
    .update(notifications)
    .set({ archivedAt: now, readAt: now })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  revalidatePath("/notificaciones");
  revalidatePath("/mis-mascotas");
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  revalidatePath("/notificaciones");
  revalidatePath("/mis-mascotas");
}
