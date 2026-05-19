import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { NotificationCard } from "@/components/NotificationCard";
import { db, notifications, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

export default async function NotificacionesPage() {
  const { user } = await requireUserOrRedirect();

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

// NotificationCard moved to components/NotificationCard.tsx — shared
// with /inicio dashboard. Import re-exported at top.
