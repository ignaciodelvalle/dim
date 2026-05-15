import {
  archiveNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import { type Notification, type Pet, db, notifications, pets } from "@/db";
import { notificationSeverityLabel, relativeTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

export default async function NotificacionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // (app) layout guards this

  // All non-archived notifications, newest first, joined with their related
  // pet (if any) so we can render a "Ver mascota" link without an N+1.
  const rows = await db
    .select({ notification: notifications, pet: pets })
    .from(notifications)
    .leftJoin(pets, eq(notifications.relatedPetId, pets.id))
    .where(and(eq(notifications.userId, user.id), isNull(notifications.archivedAt)))
    .orderBy(desc(notifications.createdAt));

  const [{ unreadCount }] = await db
    .select({ unreadCount: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, user.id),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    );

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Mis mascotas
        </Link>

        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Notificaciones
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {rows.length === 0
                ? "Sin notificaciones."
                : unreadCount > 0
                  ? `${unreadCount} sin leer · ${rows.length} en total`
                  : `${rows.length} en total`}
            </p>
          </div>
          {unreadCount > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button
                type="submit"
                className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
              >
                Marcar todas como leídas
              </button>
            </form>
          )}
        </header>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {rows.map(({ notification, pet }) => (
              <li key={notification.id}>
                <NotificationCard notification={notification} relatedPet={pet} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl p-10 text-center text-sm text-neutral-600 dark:text-neutral-400">
      Tu bandeja está vacía. Te avisaremos por acá cuando haya algo nuevo.
    </div>
  );
}

function NotificationCard({
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
        unread
          ? `${tone.unreadBg} ${tone.unreadBorder}`
          : "bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className={`w-1 self-stretch rounded-full ${tone.bar}`} aria-hidden />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <h3
              className={`text-sm ${unread ? "font-semibold" : "font-medium"} text-neutral-900 dark:text-neutral-50`}
            >
              {notification.title}
            </h3>
            <p className="text-[11px] uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
              {notificationSeverityLabel(notification.severity)} · {notification.notificationType}
            </p>
          </div>
          <time className="text-xs text-neutral-500 dark:text-neutral-500 shrink-0">
            {relativeTime(notification.createdAt)}
          </time>
        </div>

        {notification.body && (
          <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
            {notification.body}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {notification.ctaLabel && notification.ctaUrl && (
            <a
              href={notification.ctaUrl}
              target={notification.ctaUrl.startsWith("http") ? "_blank" : undefined}
              rel={notification.ctaUrl.startsWith("http") ? "noopener noreferrer" : undefined}
              className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              {notification.ctaLabel}
              {notification.ctaUrl.startsWith("http") && " ↗"}
            </a>
          )}
          {relatedPet && (
            <Link
              href={`/mis-mascotas/${relatedPet.publicToken}`}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              Ver {relatedPet.name}
            </Link>
          )}
          {unread && (
            <form action={markRead}>
              <button
                type="submit"
                className="text-xs text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
              >
                Marcar como leída
              </button>
            </form>
          )}
          <form action={archive}>
            <button
              type="submit"
              className="text-xs text-neutral-500 dark:text-neutral-500 underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
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
        bar: "bg-amber-500",
        unreadBg: "bg-amber-50 dark:bg-amber-950/20",
        unreadBorder: "border-amber-200 dark:border-amber-900",
      };
    case "urgent":
      return {
        bar: "bg-red-500",
        unreadBg: "bg-red-50 dark:bg-red-950/20",
        unreadBorder: "border-red-200 dark:border-red-900",
      };
    case "success":
      return {
        bar: "bg-green-500",
        unreadBg: "bg-green-50 dark:bg-green-950/20",
        unreadBorder: "border-green-200 dark:border-green-900",
      };
    default:
      return {
        bar: "bg-blue-500",
        unreadBg: "bg-blue-50 dark:bg-blue-950/20",
        unreadBorder: "border-blue-200 dark:border-blue-900",
      };
  }
}
