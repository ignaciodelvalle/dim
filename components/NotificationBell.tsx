import Link from "next/link";

// Shared notification bell — used on owner home (/inicio) header.
// Renders a 40x40 circular icon with the unread count as a red badge.

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/notificaciones"
      aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-gob-border text-gob-text-gray transition-colors hover:bg-gob-surface-alt"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <title>Notificaciones</title>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gob-danger px-1 text-[10px] font-semibold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
