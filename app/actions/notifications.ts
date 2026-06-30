"use server";

// notifications.ts — thin shim (strangler migration 59/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/notifications/application/notification-actions.ts
//
// The requireUser() auth guard is lifted into each shim wrapper so the shim
// satisfies the authz-coverage convention. The use-cases receive the userId
// directly and no longer perform their own auth lookup.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function.

import { createClient } from "@/lib/supabase/server";
import {
  archiveNotification as _archiveNotification,
  markAllNotificationsRead as _markAllNotificationsRead,
  markNotificationRead as _markNotificationRead,
} from "@/src/modules/notifications/application/notification-actions";

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
  return _markNotificationRead(user.id, notificationId);
}

export async function archiveNotificationAction(notificationId: string): Promise<void> {
  const user = await requireUser();
  return _archiveNotification(user.id, notificationId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  return _markAllNotificationsRead(user.id);
}
