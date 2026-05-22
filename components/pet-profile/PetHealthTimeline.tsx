"use client";

// PetHealthTimeline — collapsed health timeline for pet profile v2.
//
// Rendered inside a native <details> element (default closed). Attachment
// URLs are signed lazily on first expand via useTransition. Signed URLs are
// memoized in React state — re-expanding does NOT re-trigger signing.
//
// The server prop `recentFive` comes from fetchPetEventsForProfileV2 Query B
// (metadata only — no signed URLs). When the user expands the details, this
// client component fires signTimelineAttachments to get signed URLs for any
// attachment-bearing events, then renders thumbnails.
//
// This component REPLACES the previous PetHealthTimeline which used filter
// chips and fetched all events. Old consumers that pass `events` and
// `fullHistoryHref` are kept working via the compat props but the component
// no longer uses the old TimelineEvent[] type.

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import type { PetEventMetadata } from "@/lib/owner-dashboard";
import {
  capRecentFive,
  formatTimelineDate,
  latestEvent,
  timelineEventLabel,
} from "./PetHealthTimeline.helpers";

// ---------------------------------------------------------------------------
// Signing server action (lazy — only called on expand)
// ---------------------------------------------------------------------------

// The action lives in the actions layer. We accept it as a prop so this
// component stays decoupled from server-only imports.
type SignerFn = (
  eventIds: string[],
) => Promise<Record<string, string>>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  recentFive: PetEventMetadata[];
  fullHistoryHref: string;
  /** Optional signer function. When not provided, no thumbnails are shown. */
  signAttachments?: SignerFn;
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2.5 animate-pulse">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/2 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-2 w-1/3 rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event row
// ---------------------------------------------------------------------------

function EventRow({
  event,
  signedUrl,
  href,
}: {
  event: PetEventMetadata;
  signedUrl: string | null;
  href: string;
}) {
  const label = timelineEventLabel(event.eventType, event.summary);
  const dateLabel = formatTimelineDate(event.occurredAt);

  return (
    <Link
      href={href}
      className="flex items-start gap-3 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900"
    >
      {signedUrl ? (
        <img
          src={signedUrl}
          alt=""
          aria-hidden
          className="mt-0.5 h-8 w-8 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-sm dark:bg-neutral-800"
        >
          •
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {label}
        </span>
      </span>
      <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
        {dateLabel}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PetHealthTimeline({ recentFive, fullHistoryHref, signAttachments }: Props) {
  const events = capRecentFive(recentFive);
  const latest = latestEvent(events);

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const hasSigned = useRef(false);

  function handleToggle(e: React.MouseEvent<HTMLElement>) {
    const details = e.currentTarget as HTMLDetailsElement;
    // Only sign on the first open.
    if (!details.open || hasSigned.current || !signAttachments) return;
    hasSigned.current = true;
    const eventIds = events.map((ev) => ev.id);
    startTransition(async () => {
      const urls = await signAttachments(eventIds);
      setSignedUrls(urls);
    });
  }

  return (
    <section
      aria-labelledby="pp-timeline-h"
      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <details onToggle={handleToggle as unknown as React.ToggleEventHandler<HTMLDetailsElement>}>
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <h2
            id="pp-timeline-h"
            className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
          >
            Últimos eventos · {events.length}
          </h2>
          <div className="flex items-center gap-2">
            {latest && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                {formatTimelineDate(latest.occurredAt)}
              </span>
            )}
            <span
              aria-hidden
              className="text-xs text-neutral-400 dark:text-neutral-600"
            >
              ▸
            </span>
          </div>
        </summary>

        <div className="mt-3">
          {isPending ? (
            <ul aria-label="Cargando eventos" aria-busy="true">
              {events.map((ev) => (
                <li key={ev.id}>
                  <SkeletonRow />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {events.map((ev) => (
                <li key={ev.id}>
                  <EventRow
                    event={ev}
                    signedUrl={signedUrls[ev.id] ?? null}
                    href={fullHistoryHref}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <Link
              href={fullHistoryHref}
              className="text-xs font-medium text-gob-azul-link hover:underline"
            >
              Ver historial completo →
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}
