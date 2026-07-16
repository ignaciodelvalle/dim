// CaptureOptionsList — WP-7 full discoverability list of loggable events and
// owner flows, grouped by category, driven by ALL_CAPTURE_OPTIONS + the
// event-capture registry so it stays in sync automatically.
//
// Extracted from anotar/page.tsx (pet-document-redesign D1) so BOTH the
// standalone /anotar fallback page (ADR-5) AND SheetMounter's `?sheet=anotar`
// branch render the identical list — no duplicated category-grouping logic.
// No "use client" directive: it has no hooks/state, so it renders correctly
// from both a server page (anotar/page.tsx) and a client component
// (SheetMounter.tsx).

import Link from "next/link";

import { buildCaptureDeeplink } from "@/lib/events/event-capture-registry";
import { todayIsoInAr } from "@/lib/utils/format";
import { ALL_CAPTURE_OPTIONS } from "./handoff";

export function CaptureOptionsList({ petPublicToken }: { petPublicToken: string }) {
  const today = todayIsoInAr();

  const optionsWithHref = ALL_CAPTURE_OPTIONS.map((opt) => {
    let href: string;
    if (opt.routeOverride) {
      href = `/mis-mascotas/${petPublicToken}${opt.routeOverride}`;
    } else {
      href =
        buildCaptureDeeplink(opt.eventType, petPublicToken, { occurredAt: today }) ??
        `/mis-mascotas/${petPublicToken}`;
    }
    return { ...opt, href };
  });

  const categories = Array.from(new Set(ALL_CAPTURE_OPTIONS.map((o) => o.category)));

  return (
    <div className="space-y-7">
      {categories.map((category) => {
        const items = optionsWithHref.filter((o) => o.category === category);
        return (
          <section key={category}>
            <h2 className="mb-2 font-[var(--font-ln-mono)] text-xs font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]">
              {category}
            </h2>
            <ul className="divide-y divide-[var(--color-ln-stripe)] overflow-hidden rounded-sm border border-[var(--color-ln-line-strong)]">
              {items.map((opt) => (
                <li key={`${opt.eventType}-${opt.routeOverride ?? ""}`}>
                  <Link
                    href={opt.href}
                    className="flex items-center justify-between px-3.5 py-2.5 text-[var(--text-md)] text-[var(--color-ln-ink)] transition-colors hover:bg-[var(--color-ln-stripe)]"
                  >
                    <span>{opt.label}</span>
                    <span className="text-[var(--text-sm)] text-[var(--color-ln-mute)]">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
