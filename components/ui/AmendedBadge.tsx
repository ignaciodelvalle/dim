// AmendedBadge — inline indicator for events that have been corrected.
//
// Renders a small "Corregido el {fecha}" chip. Expandable to show the original
// href (link to the event in /historial). Screen-reader-friendly.
//
// D2 (Wave 2 Item 15): the libreta view shows the CURRENT value derived from
// the projection; this badge signals that an amendment exists. The original
// event is always accessible at the provided `originalHref`.

import Link from "next/link";

export type AmendedBadgeProps = {
  /** ISO date string or Date of when the amendment occurred. */
  amendedAt: Date | string;
  /** URL to the original (unamended) event in /historial or /eventos/[id]. */
  originalHref: string;
};

function formatAmendedAt(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

export function AmendedBadge({ amendedAt, originalHref }: AmendedBadgeProps) {
  return (
    <output
      className="inline-flex items-center gap-[5px] rounded-full border border-[var(--color-ln-warn)] bg-[var(--color-ln-warn-bg,var(--color-ln-stripe))] px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[10px] text-[var(--color-ln-ink-2)]"
      aria-label={`Registro corregido el ${formatAmendedAt(amendedAt)}`}
    >
      <span aria-hidden="true">✎</span>
      Corregido el {formatAmendedAt(amendedAt)}
      {" · "}
      <Link
        href={originalHref}
        className="underline hover:text-[var(--color-ln-azul)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ln-azul)]"
        aria-label="Ver registro original"
      >
        Ver original
      </Link>
    </output>
  );
}
