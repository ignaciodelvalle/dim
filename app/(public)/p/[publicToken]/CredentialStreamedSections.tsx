// Streamed (Suspense) sections of the PUBLIC credential page (/p/[publicToken]).
//
// #16a — the credential card's SHELL (guilloché frame, header/tier chip, pet
// photo LCP, name, identity + confidence rollups from the cheap Stage-1 reads)
// is emitted by page.tsx on the FIRST flush. The two remaining regions are the
// HEAVY event/vaccination projections — they must NOT block the photo, so they
// are extracted here as async server components rendered behind <Suspense> in
// page.tsx:
//
//   • CredentialTier2Medical — the owner-opt-in Tier-2 medical summary. Runs the
//     full vaccination history + medications + sterilization queries and folds
//     event_amended corrections (WAVE D1) exactly as the inline block did, then
//     renders <Tier2MedicalView>. Only mounted when tier2Active (a pet-row flag
//     resolved in the shell), so the skeleton never flashes for Tier-0 pets.
//
//   • CredentialOriginOrg — the origin-shelter badge. resolveOriginOrg walks up
//     to three rows (custody → adoption → org); below the fold, so it streams
//     with a null fallback.
//
// Byte-for-byte the same rendered output as the previous inline code — only the
// await boundary moved. This file is a sibling of page.tsx (page.tsx exports
// only its default component; the streamed pieces live here so they stay
// import-testable without adding page exports).

import { and, eq, sql } from "drizzle-orm";

import { Skeleton } from "@/components/ui/Skeleton";
import { db, petEvents } from "@/db";
import type { Pet } from "@/db";
import { computeVaccinationSummary, hasAnyVaccineRecord } from "@/lib/domain/libreta-health-status";
import { overlayAmendments } from "@/lib/infra/amendment";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { resolveOriginOrg, shouldShowOriginOrgBadge } from "@/lib/infra/origin-org";
import { Tier2MedicalView } from "./Tier2MedicalView";
import { deriveActiveMedications } from "./credential-badges";

// ---------------------------------------------------------------------------
// CredentialTier2Medical — Tier 2 medical summary (streamed).
// Mirrors the former page.tsx tier2 block: FULL vaccination history feeds the
// SAME computeVaccinationSummary the owner libreta uses (bug 3), with the pet's
// event_amended rows overlaid so a corrected dose/medication supersedes on the
// public credential too. Wrapper <div className="border-t border-ln-line-2">
// is preserved so the section keeps its exact card seam.
// ---------------------------------------------------------------------------

export async function CredentialTier2Medical({
  petId,
  species,
  jurisdictionProvince,
  jurisdictionLocality,
  enabledUntil,
  permanentConditions,
  permanentConditionsOther,
}: {
  petId: string;
  species: Pet["species"];
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  enabledUntil: Date | null;
  permanentConditions: readonly string[];
  permanentConditionsOther: string | null;
}) {
  // Run the tier2 queries concurrently — none depends on the others. Each
  // clinical query selects the full overlay shape (id/eventType/occurredAt/
  // payload) and is folded with the pet's event_amended rows (WAVE D1).
  const [vaccineEvents, sterilRows, medRows, amendmentEvents, dueSoonWindowRule] =
    await Promise.all([
      // FULL vaccination history — same input the owner's libreta feeds into
      // computeVaccinationSummary. Type-narrowed, so it stays cheap at scale.
      db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          occurredAt: petEvents.occurredAt,
          payload: petEvents.payload,
        })
        .from(petEvents)
        .where(
          and(eq(petEvents.petId, petId), eq(petEvents.eventType, "vaccination_administered")),
        ),
      db
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "sterilization_performed")))
        .limit(1),
      // Active medications: started without a referencing stop.
      db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          occurredAt: petEvents.occurredAt,
          payload: petEvents.payload,
        })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, petId),
            sql`${petEvents.eventType} IN ('medication_started','medication_stopped')`,
          ),
        ),
      db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          occurredAt: petEvents.occurredAt,
          payload: petEvents.payload,
        })
        .from(petEvents)
        .where(and(eq(petEvents.petId, petId), eq(petEvents.eventType, "event_amended"))),
      // Same jurisdiction-resolved window the owner's libreta uses — the two
      // surfaces MUST share the whole derivation, thresholds included.
      resolveBusinessRule("due_soon_window", {
        country: "AR",
        province: jurisdictionProvince,
        locality: jurisdictionLocality,
      }),
    ]);

  // SINGLE SHARED DERIVATION (bug 3): the exact function + inputs the owner
  // libreta uses — corrections folded first, then catalog/due-date classification.
  const summary = computeVaccinationSummary(
    overlayAmendments([...vaccineEvents, ...amendmentEvents]),
    species,
    new Date(),
    dueSoonWindowRule.payload.days,
  );

  return (
    <div className="border-t border-ln-line-2">
      <Tier2MedicalView
        enabledUntil={enabledUntil}
        vaccineSummary={{
          active: summary.active,
          expired: summary.expired,
          dueSoon: summary.dueSoon,
          missing: summary.missing,
        }}
        hasVaccineRecords={hasAnyVaccineRecord(summary)}
        isSterilized={sterilRows.length > 0}
        activeMedications={deriveActiveMedications([...medRows, ...amendmentEvents])}
        permanentConditions={permanentConditions ?? []}
        permanentConditionsOther={permanentConditionsOther}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CredentialTier2MedicalSkeleton — Suspense fallback for the section above.
// Reserves the height of the always-present base (eyebrow + heading + 2 stat
// cards) so the sections below it do not jump when the medical summary streams
// in. Only ever shown for tier2-enabled pets (content is guaranteed to follow),
// so there is no skeleton-then-nothing flash.
// aria-busy + sr-only "Cargando…" mirrors the repo loading.tsx idiom.
// ---------------------------------------------------------------------------

export function CredentialTier2MedicalSkeleton() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="block border-t border-ln-line-2 px-4 py-3.5"
    >
      <span className="sr-only">Cargando…</span>
      <Skeleton w="62%" h="10px" radius="3px" className="mb-1.5" />
      <Skeleton w="48%" h="16px" radius="3px" className="mb-1" />
      <Skeleton w="34%" h="11px" radius="3px" className="mb-3" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Skeleton w="100%" h="64px" radius="var(--radius-sm)" />
        <Skeleton w="100%" h="64px" radius="var(--radius-sm)" />
      </div>
    </output>
  );
}

// ---------------------------------------------------------------------------
// CredentialOriginOrg — T-4.3 origin-shelter badge (streamed).
// Same resolver + gate (verified AND tier0ShowOriginOrg) and same markup as the
// former inline block; returns null when no org resolves or the gate is closed.
// The avatar stays a raw <img> on purpose: organizations.avatar_url is a
// free-text column (uncertain host), the image is a 28px decorative avatar below
// the fold, and next/image would add a host-allowlist failure mode on the hot
// path for no byte or LCP benefit.
// The raw text-[9px]/text-[13px] below are MOVED grandfathered values (the
// public credential's rendered bytes must not change in this refactor; 9/13px
// have no --text-* token) — baselined in the design-token ratchet, not new design.
// ---------------------------------------------------------------------------

export async function CredentialOriginOrg({ petId }: { petId: string }) {
  const originOrg = await resolveOriginOrg(petId);
  if (!shouldShowOriginOrgBadge(originOrg) || !originOrg) return null;

  return (
    <div
      data-section="origin-org-badge"
      className="flex items-center gap-2.5 border-t border-ln-line-2 px-4 py-3"
    >
      {originOrg.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={originOrg.avatarUrl}
          alt=""
          aria-hidden="true"
          className="h-[28px] w-[28px] flex-shrink-0 rounded-full object-cover"
        />
      )}
      <div className="min-w-0">
        <p className="m-0 font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] text-ln-mute">
          Refugio de origen
        </p>
        <p className="m-0 truncate text-[13px] font-medium text-ln-ink">{originOrg.displayName}</p>
      </div>
    </div>
  );
}
