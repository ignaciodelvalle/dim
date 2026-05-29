import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { NotificationCard } from "@/components/NotificationCard";
import { EmptyState } from "@/components/poncho/EmptyState";
import { Tabs } from "@/components/poncho/Tabs";
import { type Notification, type Pet, db, notifications, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { fetchNotificationCategoryCounts } from "@/lib/owner-dashboard";
import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

// Grouping (handoff P4-5): when ≥3 notifications share the same
// (relatedPetId, notificationType), collapse into a single "leader" row
// with a "+ N más" disclosure that expands the rest. Singletons and
// groups of 2 keep individual rendering.

const GROUP_MIN = 3;

type NotificationRow = { notification: Notification; pet: Pet | null };

type Group =
  | { kind: "single"; row: NotificationRow }
  | { kind: "group"; leader: NotificationRow; rest: NotificationRow[] };

function groupNotifications(rows: NotificationRow[]): Group[] {
  // Pre-count buckets so we know which rows are part of a group ≥ GROUP_MIN.
  // Bucket key: (relatedPetId ?? "_") + notificationType. relatedPetId may
  // be null (admin-side notifications); they bucket by type only.
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.notification.relatedPetId ?? "_"}|${row.notification.notificationType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Single pass — preserve the original descending-createdAt order. When
  // we hit the first row of a 3+ bucket, emit a group leader carrying the
  // rest of the bucket. Subsequent rows from that same bucket are skipped
  // (already represented by the leader's `rest`).
  const result: Group[] = [];
  const seenBuckets = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const key = `${row.notification.relatedPetId ?? "_"}|${row.notification.notificationType}`;
    const total = counts.get(key) ?? 0;
    if (total < GROUP_MIN) {
      result.push({ kind: "single", row });
      continue;
    }
    // ≥ GROUP_MIN — bucket gets collapsed under one leader.
    const existing = seenBuckets.get(key);
    if (existing) {
      // Already emitted the leader for this bucket; append to its `rest`.
      existing.push(row);
      continue;
    }
    // First time we see this bucket; this row is the leader (most recent).
    const rest: NotificationRow[] = [];
    seenBuckets.set(key, rest);
    result.push({ kind: "group", leader: row, rest });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

type Category = "all" | "perdidas" | "health" | "custody" | "adoption" | "welfare" | "admin";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "Todas",
  perdidas: "Pérdidas",
  health: "Salud",
  custody: "Custodia",
  adoption: "Adopciones",
  welfare: "Denuncias",
  admin: "Sistema",
};

const EMPTY_CATEGORY_TITLES: Record<Category, string> = {
  all: "Sin notificaciones",
  perdidas: "Sin avistajes ni reportes de mascotas perdidas",
  health: "Sin notificaciones de salud",
  custody: "Sin notificaciones de custodia",
  adoption: "Sin notificaciones de adopciones",
  welfare: "Sin notificaciones de denuncias",
  admin: "Sin notificaciones de sistema",
};

const EMPTY_CATEGORY_DESCRIPTIONS: Partial<Record<Category, string>> = {
  perdidas:
    "Te avisamos acá cuando alguien reporte un avistaje de tus mascotas perdidas.",
};

const CATEGORY_ORDER: Category[] = [
  "all",
  "perdidas",
  "custody",
  "health",
  "adoption",
  "welfare",
  "admin",
];

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
    cat &&
    ["all", "perdidas", "health", "custody", "adoption", "welfare", "admin"].includes(cat)
      ? (cat as Category)
      : "all";

  // Counts per category (single query, drives tab labels).
  const counts = await fetchNotificationCategoryCounts(user.id);

  // Build tab definitions — hide tabs with count 0 (except "Todas").
  const countByCategory: Record<Category, number> = {
    all: counts.all,
    perdidas: counts.perdidas,
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
      badge: cat === "perdidas" && counts.perdidasUrgent > 0 ? counts.perdidasUrgent : undefined,
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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
        >
          ← Mis mascotas
        </Link>

        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Notificaciones</h1>
            <p className="text-sm text-gob-text-gray  mt-1">
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
                className="text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text "
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
            description={
              EMPTY_CATEGORY_DESCRIPTIONS[activeCat] ??
              "Tu bandeja está vacía. Te avisaremos por acá cuando haya algo nuevo."
            }
          />
        ) : (
          <ul className="space-y-3">
            {groupNotifications(rows).map((entry) => {
              if (entry.kind === "single") {
                return (
                  <li key={entry.row.notification.id}>
                    <NotificationCard
                      notification={entry.row.notification}
                      relatedPet={entry.row.pet}
                    />
                  </li>
                );
              }
              // Grouped: leader card + collapsible '+N más' details with the
              // remaining rows.
              return (
                <li key={entry.leader.notification.id}>
                  <NotificationCard
                    notification={entry.leader.notification}
                    relatedPet={entry.leader.pet}
                  />
                  <details className="mt-2 ml-3 pl-3 border-l-2 border-gob-border ">
                    <summary className="cursor-pointer text-xs text-gob-azul-link hover:underline select-none">
                      + {entry.rest.length} más del mismo tipo
                    </summary>
                    <ul className="space-y-3 mt-3">
                      {entry.rest.map(({ notification, pet }) => (
                        <li key={notification.id}>
                          <NotificationCard notification={notification} relatedPet={pet} />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
