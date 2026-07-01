import Link from "next/link";

import { NotificationCard } from "@/components/NotificationCard";
import { LnEmptyState } from "@/components/ui/EmptyState";
import type { Pet } from "@/db";
import type { DashboardNotification } from "@/lib/analytics/owner-dashboard";

// NotificationCard expects a full Pet but only reads publicToken + name.
// The widget query carries just those two fields; cast through unknown
// to satisfy TypeScript without sprinkling `any` at the call site.
function buildPartialPet(p: { publicToken: string; name: string }): Pet {
  return p as unknown as Pet;
}

// Top-N unread notifications. "Ver todas" links to the full /notificaciones
// page. Zero unread → encouraging empty-state.

export function NotificationsWidget({
  notifications,
  totalUnread,
}: {
  notifications: DashboardNotification[];
  totalUnread: number;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-[var(--color-ln-ink)]">
          Notificaciones
          {totalUnread > 0 && (
            <span className="ml-2 text-xs font-normal text-[var(--color-ln-mute)]">
              ({totalUnread} sin leer)
            </span>
          )}
        </h2>
        <Link
          href="/notificaciones"
          className="text-sm text-[var(--color-ln-ink-2)] underline underline-offset-4 hover:text-[var(--color-ln-ink)]"
        >
          Ver todas →
        </Link>
      </div>
      {notifications.length === 0 ? (
        <LnEmptyState variant="dashed" title="No tenés nada sin leer." />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <li key={n.notification.id}>
              <NotificationCard
                notification={n.notification}
                // NotificationCard only reads publicToken + name from the
                // related Pet; the dashboard query carries just those two
                // fields. The unsafe cast is intentional and minimal.
                relatedPet={n.pet ? buildPartialPet(n.pet) : null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
