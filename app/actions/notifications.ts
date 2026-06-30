"use server";

// notifications.ts — thin shim (strangler migration 59/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/notifications/application/notification-actions.ts
//
// This file re-exports all originally-exported symbols with identical
// signatures so all callers keep working unchanged.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function.

import {
  archiveNotification as _archiveNotification,
  markAllNotificationsRead as _markAllNotificationsRead,
  markNotificationRead as _markNotificationRead,
} from "@/src/modules/notifications/application/notification-actions";

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  return _markNotificationRead(notificationId);
}

export async function archiveNotificationAction(notificationId: string): Promise<void> {
  return _archiveNotification(notificationId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  return _markAllNotificationsRead();
}
