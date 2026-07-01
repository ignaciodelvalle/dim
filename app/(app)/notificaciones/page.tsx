// Notificaciones — Libreta Nacional redesign.
// Presentation only; all data fetching, grouping logic, and actions unchanged.
// Category tabs use Link-based server navigation (no client Tabs component).

import Link from "next/link";
import { Suspense } from "react";

import { markAllNotificationsReadAction } from "@/app/actions/notifications";
import { NotificationCard } from "@/components/NotificationCard";
import { LnButton } from "@/components/ui/Button";
import { LnSectionHead } from "@/components/ui/DocElements";
import { type Notification, type Pet, db, notifications, pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { fetchNotificationCategoryCounts } from "@/lib/owner-dashboard";
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  newerHref,
  olderHref,
} from "@/lib/utils/keyset-pagination";
import { and, desc, eq, isNull } from "drizzle-orm";

// Maximum notifications rendered per page (PERF-5 keyset pagination).
// We fetch LIMIT+1 to detect hasMore; render only LIMIT rows.
const NOTIFICATIONS_PAGE_LIMIT = 100;

// ---------------------------------------------------------------------------
// Grouping logic (unchanged from original)
// ---------------------------------------------------------------------------

const GROUP_MIN = 3;

type NotificationRow = { notification: Notification; pet: Pet | null };

type Group =
  | { kind: "single"; row: NotificationRow }
  | { kind: "group"; leader: NotificationRow; rest: NotificationRow[] };

function groupNotifications(rows: NotificationRow[]): Group[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.notification.relatedPetId ?? "_"}|${row.notification.notificationType}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: Group[] = [];
  const seenBuckets = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const key = `${row.notification.relatedPetId ?? "_"}|${row.notification.notificationType}`;
    const total = counts.get(key) ?? 0;
    if (total < GROUP_MIN) {
      result.push({ kind: "single", row });
      continue;
    }
    const existing = seenBuckets.get(key);
    if (existing) {
      existing.push(row);
      continue;
    }
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

  const unreadCount = rows.filter((r) => r.notification.readAt === null).length;
  const groups = groupNotifications(rows);

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/inicio"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Inicio
      </Link>

      {/* Header */}
      <div className="mb-[20px] flex items-start justify-between gap-4">
        <div>
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Notificaciones
          </h1>
          <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
            {counts.all === 0
              ? "Sin notificaciones."
              : unreadCount > 0
                ? `${unreadCount} sin leer · ${rows.length} en total`
                : `${rows.length} en total`}
          </p>
        </div>
        {unreadCount > 0 && (
          <Suspense>
            <form action={markAllNotificationsReadAction} className="flex-shrink-0 mt-[6px]">
              <LnButton type="submit" variant="ghost" size="sm">
                Marcar todas como leídas
              </LnButton>
            </form>
          </Suspense>
        )}
      </div>

      {/* Category tab bar — Link-based server navigation */}
      {visibleCategories.length > 1 && (
        <div
          className="mb-[24px] flex gap-0 overflow-x-auto border-b border-[var(--color-ln-line)]"
          role="tablist"
          aria-label="Filtrar notificaciones por categoría"
        >
          {visibleCategories.map((c) => {
            const isActive = c === activeCat;
            const count = countByCategory[c];
            return (
              <Link
                key={c}
                href={c === "all" ? "/notificaciones" : `/notificaciones?cat=${c}`}
                role="tab"
                aria-selected={isActive}
                className={[
                  "inline-flex flex-shrink-0 items-center gap-[7px] border-b-2 px-[16px] py-[10px] text-[13px] font-semibold no-underline transition-colors -mb-px",
                  isActive
                    ? "border-b-[var(--color-ln-azul)] text-[var(--color-ln-azul)]"
                    : "border-b-transparent text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink-2)]",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {CATEGORY_LABELS[c]}
                <span
                  className={[
                    "rounded-full px-[6px] py-[1px] font-[var(--font-ln-mono)] text-xs",
                    isActive
                      ? "bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]"
                      : "bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Notification list */}
      {rows.length === 0 ? (
        <div className="py-[32px] text-center">
          <p className="font-[var(--font-ln-serif)] text-base font-semibold text-[var(--color-ln-ink-2)]">
            {EMPTY_CATEGORY_TITLES[activeCat]}
          </p>
          {(EMPTY_CATEGORY_DESCRIPTIONS[activeCat] ??
            "Tu bandeja está vacía. Te avisaremos por acá cuando haya algo nuevo.") && (
            <p className="mt-[6px] text-[13px] text-[var(--color-ln-mute)]">
              {EMPTY_CATEGORY_DESCRIPTIONS[activeCat] ??
                "Tu bandeja está vacía. Te avisaremos por acá cuando haya algo nuevo."}
            </p>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-[10px]">
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
                <details className="mt-[8px] ml-[12px] border-l-2 border-[var(--color-ln-line)] pl-[12px]">
                  <summary className="cursor-pointer font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] select-none hover:underline">
                    + {entry.rest.length} más del mismo tipo
                  </summary>
                  <ul className="mt-[10px] flex flex-col gap-[8px]">
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
          className="mt-[28px] flex items-center justify-between gap-4 border-t border-[var(--color-ln-line)] pt-[20px]"
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
    </div>
  );
}
