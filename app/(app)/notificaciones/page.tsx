// Notificaciones — Libreta Nacional redesign.
// Presentation only; all data fetching, grouping logic, and actions unchanged.
// Category tabs use Link-based server navigation (no client Tabs component).

import Link from "next/link";
import { Suspense } from "react";

import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { NotificationCard } from "@/components/NotificationCard";
import { LnButton } from "@/components/ui/Button";
import { LnSectionHead } from "@/components/ui/DocElements";
import { type UrlTabItem, UrlTabs } from "@/components/ui/UrlTabs";
import { db, notifications, pets } from "@/db";
import {
  fetchNotificationCategoryCounts,
  fetchUnreadNotificationCount,
} from "@/lib/analytics/owner-dashboard";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import {
  excludeResolvedLostEpisodeSql,
  excludeStaleWelcomeSql,
} from "@/lib/infra/notification-reconcile";
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  newerHref,
  olderHref,
} from "@/lib/utils/keyset-pagination";
import { and, desc, eq, isNull } from "drizzle-orm";

import { groupNotifications, sortNotificationsForDisplay } from "./notification-ordering";

// Maximum notifications rendered per page (PERF-5 keyset pagination).
// We fetch LIMIT+1 to detect hasMore; render only LIMIT rows.
const NOTIFICATIONS_PAGE_LIMIT = 100;

// Ordering + grouping logic lives in ./notification-ordering (pure + unit
// tested): severity-first display sort, then same-pet+type collapse.

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
  perdidas: "Te avisamos acá cuando alguien reporte un avistaje de tus mascotas perdidas.",
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
  searchParams: Promise<{ cat?: string; cursor?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { cat, cursor: rawCursor } = await searchParams;

  const activeCat: Category =
    cat && ["all", "perdidas", "health", "custody", "adoption", "welfare", "admin"].includes(cat)
      ? (cat as Category)
      : "all";

  // Keyset cursor — null means first page.
  const cursor = decodeCursor(rawCursor);

  const counts = await fetchNotificationCategoryCounts(user.id);

  const countByCategory: Record<Category, number> = {
    all: counts.all,
    perdidas: counts.perdidas,
    health: counts.health,
    custody: counts.custody,
    adoption: counts.adoption,
    welfare: counts.welfare,
    admin: counts.admin,
  };

  const visibleCategories = CATEGORY_ORDER.filter((c) => c === "all" || countByCategory[c] > 0);

  const baseClauses = [
    eq(notifications.userId, user.id),
    isNull(notifications.archivedAt),
    activeCat !== "all" ? eq(notifications.category, activeCat) : undefined,
    // Reconcile against current state: drop lost-active alerts (sighting,
    // broadcast, possession) once the subject pet is no longer lost (PO QA §2).
    excludeResolvedLostEpisodeSql,
    // Drop the onboarding welcome ("Registrá tu primera mascota") once the
    // user actually owns a pet (tester fix #8 — read-time, no migration).
    excludeStaleWelcomeSql,
    // Keyset predicate: only rows older than the cursor.
    keysetWhere(notifications.createdAt, notifications.id, cursor),
  ].filter(Boolean);
  const whereClause = and(...(baseClauses as Parameters<typeof and>));

  // Fetch limit+1 to detect whether a next page exists.
  const rawRows = await db
    .select({ notification: notifications, pet: pets })
    .from(notifications)
    .leftJoin(pets, eq(notifications.relatedPetId, pets.id))
    .where(whereClause)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(NOTIFICATIONS_PAGE_LIMIT + 1);

  const hasMore = rawRows.length > NOTIFICATIONS_PAGE_LIMIT;
  const rows = hasMore ? rawRows.slice(0, NOTIFICATIONS_PAGE_LIMIT) : rawRows;

  // Build filter params map (cursor excluded — it's managed by pagination links).
  const filterParams: Record<string, string | undefined> =
    activeCat !== "all" ? { cat: activeCat } : {};

  // Last row drives the "older" cursor.
  const lastRow = rows.at(-1);
  const olderLink =
    hasMore && lastRow
      ? olderHref("/notificaciones", filterParams, {
          ts: lastRow.notification.createdAt,
          id: lastRow.notification.id,
        })
      : null;
  // "Back to page 1" link — only shown when we're not already on page 1.
  const newerLink = rawCursor ? newerHref("/notificaciones", filterParams) : null;

  // Unread count MUST span ALL non-archived rows for the active view, not just
  // the current page (review C.3). The old `rows.filter(...)` counted over the
  // ≤100-row page, so an owner with more than a page of unread notifications
  // (e.g. an org admin after a lost-pet broadcast fan-out) saw an understated
  // "N sin leer" — a first-hand "notifications say fewer than there are"
  // symptom. The helper aggregates with the same predicate the category counts
  // use.
  const unreadCount = await fetchUnreadNotificationCount(
    user.id,
    activeCat !== "all" ? activeCat : undefined,
  );
  // "en total" pairs with the unread figure, so it must also be the view-wide
  // total (not the current page's row count) or the two would be incoherent.
  const totalCount = activeCat === "all" ? counts.all : countByCategory[activeCat];
  // Severity-first display order (urgent → warning → success → info), then
  // recency — applied to the fetched page, then grouped. The keyset cursor is
  // still derived from the SQL (chronological) order's last row above, so this
  // reordering must NOT mutate `rows` (sortNotificationsForDisplay returns a
  // copy). Trade-off: page composition stays chronological (an urgent item on a
  // later page does not jump to page 1); within a page, urgent floats to top.
  const groups = groupNotifications(sortNotificationsForDisplay(rows));

  const tabItems: UrlTabItem[] = visibleCategories.map((c) => ({
    value: c,
    label: CATEGORY_LABELS[c],
    badge: countByCategory[c],
    badgeTone: "neutral",
  }));

  // List + pagination — rendered once, then shown either inside the category
  // tab bar (UrlTabs) or bare when there is only one populated category.
  const listBody = (
    <>
      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <p className="font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink-2)]">
            {EMPTY_CATEGORY_TITLES[activeCat]}
          </p>
          <p className="mt-1.5 text-[13px] text-[var(--color-ln-mute)]">
            {EMPTY_CATEGORY_DESCRIPTIONS[activeCat] ??
              "Tu bandeja está vacía. Te avisaremos por acá cuando haya algo nuevo."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {groups.map((entry) => {
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
            return (
              <li key={entry.leader.notification.id}>
                <NotificationCard
                  notification={entry.leader.notification}
                  relatedPet={entry.leader.pet}
                />
                <details className="mt-2 ml-3 border-l-2 border-[var(--color-ln-line)] pl-3">
                  <summary className="cursor-pointer font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] select-none hover:underline">
                    + {entry.rest.length} más del mismo tipo
                  </summary>
                  <ul className="mt-2.5 flex flex-col gap-2">
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

      {/* Pagination footer — only shown when there are rows */}
      {(newerLink || olderLink) && (
        <nav
          aria-label="Paginación de notificaciones"
          className="mt-7 flex items-center justify-between gap-4 border-t border-[var(--color-ln-line)] pt-5"
        >
          <div>
            {newerLink && (
              <Link
                href={newerLink}
                className="font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
              >
                ← Más recientes
              </Link>
            )}
          </div>
          <div>
            {olderLink && (
              <Link
                href={olderLink}
                className="font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
              >
                Ver más antiguos →
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Notificaciones
          </h1>
          <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
            {counts.all === 0
              ? "Sin notificaciones."
              : unreadCount > 0
                ? `${unreadCount} sin leer · ${totalCount} en total`
                : `${totalCount} en total`}
          </p>
        </div>
        {unreadCount > 0 && (
          <Suspense>
            <form action={markAllNotificationsReadAction} className="flex-shrink-0 mt-1.5">
              <LnButton type="submit" variant="ghost" size="sm">
                Marcar todas como leídas
              </LnButton>
            </form>
          </Suspense>
        )}
      </div>

      {/* Category tabs — canonical UrlTabs (APG keyboard nav) when more than one
          category is populated; otherwise the list stands alone. */}
      {visibleCategories.length > 1 ? (
        <UrlTabs
          paramKey="cat"
          defaultValue="all"
          tabs={tabItems}
          aria-label="Filtrar notificaciones por categoría"
        >
          <div className="mt-6">{listBody}</div>
        </UrlTabs>
      ) : (
        listBody
      )}
    </div>
  );
}
