// Content moderation — the one clause that makes "ocultar" a derivation.
//
// WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT IN `lost-mode.ts`
// ---------------------------------------------------------------------------
// It started there, scoped to the lost cockpit, and that was the defect. The
// rule it enforces is about a SUBJECT — "an item somebody reported" — and a
// helper that lives inside one feature's module reads as belonging to that
// feature. A fresh-context review then found the lost-feed note being rendered
// on SEVEN more reads that had never heard of it, one of them anonymous. The
// clause moved here so the next person adding a read of `pet_events` finds a
// module named after the concept rather than after the first screen that
// needed it.
//
// THE RULE, in one sentence, and it is only true if applied everywhere:
//   A REPORTED ITEM IS NEVER SHOWN, NEVER COUNTED AND NEVER THE HEADLINE.
//
// WHERE IT IS APPLIED — TWELVE QUERIES ACROSS TEN FILES. Enumerated because a
// set described in prose is a set nothing checks; the list below is mirrored by
// `__tests__/content-report-read-coverage.test.ts`, which derives it from source
// and fails BOTH ways — a new read that carries neither the clause nor a
// declared exemption, and a declared entry whose file no longer matches.
//
//   THE OWNER'S COCKPIT
//     1-3. lib/infra/lost-mode.ts — three queries: the feed list, the
//          `sightingsCount`, and the last-seen overlay.
//     4.   lib/analytics/owner-dashboard.ts — the "últimos movimientos" strip.
//          It has NO type filter and `deriveEventSummary` renders
//          `payload.text` for a `note_added`, so a reported message was
//          previewable there. Found by the coverage fence, not by reading.
//   PUBLIC / ANONYMOUS
//     5.   src/modules/pets/application/read/load-public-credential.ts — the
//          credential overlay a stranger with the QR reads.
//     6.   lib/infra/case-queries.ts — the case timeline. `lost_pet_episode` is
//          in `PUBLIC_ANONYMOUS_KINDS`, so `/casos/{code}` is readable by
//          anybody holding the CAS code, and CAS codes get shared precisely in
//          order to publicise a search.
//     7.   src/modules/lost/infrastructure/lost-listing-read.ts — the
//          `/perdidas` card and `app/sitemap.ts`.
//   THE OWNER'S OWN RECORD, AND WHAT THEY SHARE FROM IT
//     8.   src/modules/pets/application/tab-data/get-libreta-face-data.ts — the
//          rendered timeline.
//     9.   app/api/mis-mascotas/[publicToken]/libreta-export/route.ts — the
//          export.
//    10.   app/libreta/compartir/[shareToken]/page.tsx — the Tier-2 share. This
//          is the one a VET opens, and the link leaves the owner's control the
//          moment it is sent.
//   ADDRESSABLE BY ID, so a listing dropping the row is not enough on its own
//    11.   src/modules/events/application/read/load-pet-event-detail.ts
//    12.   app/(app)/mis-mascotas/[publicToken]/eventos/[eventId]/page.tsx —
//          a SECOND read of the same row; this page never goes through the
//          loader above.
//
// HOW THIS SET WAS ARRIVED AT, because the number moved three times and the
// movement is the lesson. The first delivery applied the clause to FOUR reads
// and its own comment claimed "every read of a lost-mode note_added". A
// fresh-context review counted EIGHT. Re-enumerating against the tree found TEN.
// Writing the fence — which forces every candidate into exactly one of three
// lists — found the last TWO, both of which render a stranger's sentence to a
// person. Nobody was careless; the set was simply never counted by anything that
// could fail.
//
// WHERE IT IS DELIBERATELY *NOT* APPLIED — four files, declared here because
// invariant #3 exists to forbid the undeclared kind:
//
//   · src/modules/panorama/infrastructure/repository-scope.ts and
//     src/modules/panorama/infrastructure/repository-history.ts — the map layer
//     and its history. They plot a DOT and count it. No message of anybody's is
//     rendered, and letting an owner erase points from an official map by
//     reporting them would be a moderation control with a jurisdictional reach
//     nobody asked for.
//   · lib/analytics/dashboards/perdidas.ts — the sightings counters on the
//     government dashboards. Same family, same reason: an aggregate for the
//     State, no sentence rendered.
//   · src/modules/events/application/lifecycle/report-lost-feed-item-use-case.ts
//     — the WRITER. It must see the target row to validate it and must see an
//     existing report to answer `alreadyReported`. A writer that could not see
//     what it is reporting could not report anything.
//
//   The consequence of the first three is stated rather than hidden: the owner's
//   cockpit can read "2 avistajes" while a gob dashboard counts 3. That is two
//   denominators for two audiences, which this codebase's own "name your
//   denominator" design law already permits — what it does not permit is the
//   divergence being a surprise. It is written here and in AGENTS.md
//   § Privacidad 6c.
//
// WHY A CORRELATED `NOT EXISTS` AND NOT A `NOT IN (…)` OVER A PET ID
// ---------------------------------------------------------------------------
// The first version took a `petId` and did `id NOT IN (SELECT target_event_id
// … WHERE pet_id = $1)`. Two problems, and the second is the one that matters:
//
//   · `NOT IN` over a set containing a single NULL is UNKNOWN for every row —
//     it empties the result entirely. That needed a guard.
//   · IT TOOK AN ARGUMENT. Every call site had to pass the right pet, and the
//     reads that needed it most are not scoped by pet at all: the case timeline
//     is scoped by `case_id`, the event detail by `id`. A parameter is a way to
//     be wrong, and a clause that cannot be applied to a `case_id`-scoped query
//     is a clause those queries will simply not use.
//
// Correlating on the row itself removes both. It takes nothing, it is the same
// expression everywhere, and it is correct on any read of `pet_events`
// whatever that read is scoped by.

import { petEvents } from "@/db";
import { sql } from "drizzle-orm";

/**
 * A WHERE fragment excluding every `pet_events` row somebody has reported.
 *
 * Use inside an `and(...)`. Correlates on the row under test, so it composes
 * with any scoping — `pet_id`, `case_id`, `id`, or none.
 *
 * THE REPORTED ROW IS NEVER TOUCHED. Invariant #2 forbids editing it and the
 * `enforce_pet_events_append_only` trigger makes it impossible: a `DELETE` or
 * `UPDATE` needs two session-local GUCs that no application code sets. So the
 * hide is a READ, the spine keeps both facts — the message and the objection to
 * it — and a report made by mistake is undone by changing a read rule, never by
 * resurrecting a row.
 *
 * The alias is spelled out (`content_report`) because this is a self-join onto
 * `pet_events`: without it the correlation would bind to the wrong side.
 */
export function notReportedClause() {
  return sql`NOT EXISTS (
    SELECT 1
    FROM public.pet_events AS content_report
    WHERE content_report.pet_id = ${petEvents.petId}
      AND content_report.event_type = 'content_reported'
      AND content_report.payload->>'target_event_id' = ${petEvents.id}::text
  )`;
}
