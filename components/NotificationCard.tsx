import Link from "next/link";

import { archiveNotificationAction, markNotificationReadAction } from "@/app/actions/notifications";
import type { Notification, Pet } from "@/db";
import { notificationSeverityLabel, relativeTime } from "@/lib/format";

// Shared notification card. Used by /notificaciones (full list) and
// /inicio (dashboard widget, top 5 unread). Server component because
// the action bindings happen via form action — no client hydration.
//
// Variants: unread vs read (colored border + bg vs neutral). Severity
// drives the left bar color (info/warning/urgent/success).

export function NotificationCard({
  notification,
  relatedPet,
}: {
  notification: Notification;
  relatedPet: Pet | null;
}) {
  const unread = !notification.readAt;
  const tone = severityClasses(notification.severity);
  const markRead = markNotificationReadAction.bind(null, notification.id);
  const archive = archiveNotificationAction.bind(null, notification.id);

  return (
    <article
      className={`border rounded-xl p-4 flex gap-3 transition-colors ${
        unread ? `${tone.unreadBg} ${tone.unreadBorder}` : "bg-white  border-gob-border "
      }`}
    >
      <div className={`w-1 self-stretch rounded-full ${tone.bar}`} aria-hidden />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h3 className={`text-sm ${unread ? "font-semibold" : "font-medium"} text-gob-text `}>
              {notification.title}
            </h3>
            <p className="text-[11px] uppercase tracking-wider text-gob-text-muted ">
              {notificationSeverityLabel(notification.severity)} · {notification.notificationType}
            </p>
          </div>
          <time className="text-xs text-gob-text-muted  shrink-0">
            {relativeTime(notification.createdAt)}
          </time>
        </div>

        {notification.body && (
          <p className="text-sm text-gob-text-gray  leading-relaxed">{notification.body}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {notification.ctaLabel && notification.ctaUrl && (
            <a
              href={notification.ctaUrl}
              target={notification.ctaUrl.startsWith("http") ? "_blank" : undefined}
              rel={notification.ctaUrl.startsWith("http") ? "noopener noreferrer" : undefined}
              className="px-3 py-1.5 rounded-lg bg-gob-primary  text-white  text-xs font-medium hover:bg-gob-primary  transition-colors"
            >
              {notification.ctaLabel}
              {notification.ctaUrl.startsWith("http") && " ↗"}
            </a>
          )}
          {relatedPet && (
            <Link
              href={`/mis-mascotas/${relatedPet.publicToken}`}
              className="px-3 py-1.5 rounded-lg border border-gob-border-strong  text-xs text-gob-text-gray  hover:bg-gob-surface-alt  transition-colors"
            >
              Ver {relatedPet.name}
            </Link>
          )}
          {unread && (
            <form action={markRead}>
              <button
                type="submit"
                className="text-xs text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
              >
                Marcar como leída
              </button>
            </form>
          )}
          <form action={archive}>
            <button
              type="submit"
              className="text-xs text-gob-text-muted  underline underline-offset-4 hover:text-gob-text-gray "
            >
              Archivar
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function severityClasses(severity: string) {
  switch (severity) {
    case "warning":
      return {
        bar: "bg-gob-warning",
        unreadBg: "bg-gob-warning/10 ",
        unreadBorder: "border-gob-warning ",
      };
    case "urgent":
      return {
        bar: "bg-gob-danger",
        unreadBg: "bg-gob-danger/10 ",
        unreadBorder: "border-gob-danger ",
      };
    case "success":
      return {
        bar: "bg-gob-success",
        unreadBg: "bg-gob-success/10 ",
        unreadBorder: "border-gob-success ",
      };
    default:
      return {
        bar: "bg-gob-info",
        unreadBg: "bg-gob-info/10 ",
        unreadBorder: "border-gob-info ",
      };
  }
}
