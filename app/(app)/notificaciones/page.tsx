import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { NotificationCard } from "@/components/NotificationCard";
import { EmptyState } from "@/components/poncho/EmptyState";
import { Tabs } from "@/components/poncho/Tabs";
import { db, notifications, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { fetchNotificationCategoryCounts } from "@/lib/owner-dashboard";
import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

// TODO(C4-followup): when ≥3 notifications share the same relatedPetId +
// notificationType, group them collapsibly per spec §D agrupamiento.

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

type Category = "all" | "health" | "custody" | "adoption" | "welfare" | "admin";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "Todas",
  health: "Salud",
  custody: "Custodia",
  adoption: "Adopciones",
  welfare: "Denuncias",
  admin: "Sistema",
};

const EMPTY_CATEGORY_TITLES: Record<Category, string> = {
  all: "Sin notificaciones",
  health: "Sin notificaciones de salud",
  custody: "Sin notificaciones de custodia",
  adoption: "Sin notificaciones de adopciones",
  welfare: "Sin notificaciones de denuncias",
  admin: "Sin notificaciones de sistema",
};

const CATEGORY_ORDER: Category[] = ["all", "health", "custody", "adoption", "welfare", "admin"];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { cat } = await searchParams;

  const activeCat: Category =
    cat && ["all", "health", "custody", "adoption", "welfare", "admin"].includes(cat)
      ? (cat as Category)
      : "all";

  // Counts per category (single query, drives tab labels).
  const counts = await fetchNotificationCategoryCounts(user.id);

  // Build tab definitions — hide tabs with count 0 (except "Todas").
  const countByCategory: Record<Category, number> = {
    all: counts.all,
    health: counts.health,
    custody: counts.custody,
    adoption: counts.adoption,
    welfare: counts.welfare,
    admin: counts.admin,
  };

  const tabs = CATEGORY_ORDER.filter((cat) => cat === "all" || countByCategory[cat] > 0).map(
    (cat) => ({
      value: cat,
      label: `${CATEGORY_LABELS[cat]} (${countByCategory[cat]})`,
    }),
  );

  // Main query: all non-archived notifications, filtered by category.
  const whereClause =
    activeCat === "all"
      ? and(eq(notifications.userId, user.id), isNull(notifications.archivedAt))
      : and(
          eq(notifications.userId, user.id),
          isNull(notifications.archivedAt),
          eq(notifications.category, activeCat),
        );

  const rows = await db
    .select({ notification: notifications, pet: pets })
    .from(notifications)
    .leftJoin(pets, eq(notifications.relatedPetId, pets.id))
    .where(whereClause)
    .orderBy(desc(notifications.createdAt));

  const unreadCount = rows.filter((r) => r.notification.readAt === null).length;

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
              {counts.all === 0
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

        {/* Tab bar — client component; handles URL navigation via router.replace.
            Content is server-filtered so we don't use TabsContent here. */}
        <Suspense>
          <Tabs
            paramKey="cat"
            defaultValue="all"
            tabs={tabs}
            aria-label="Filtrar notificaciones por categoría"
          >
            {/* No TabsContent children — content is server-filtered above */}
            {null}
          </Tabs>
        </Suspense>

        {/* Notification list */}
        {rows.length === 0 ? (
          <EmptyState
            title={EMPTY_CATEGORY_TITLES[activeCat]}
            description="Tu bandeja está vacía. Te avisaremos por acá cuando haya algo nuevo."
          />
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
