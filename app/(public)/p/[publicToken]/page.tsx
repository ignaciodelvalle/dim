// Public credential page — Tier 0 view by default. When pet.status === 'lost'
// the page promotes to Tier 1: owner contact info governed by the five
// disclose_*_when_lost preference columns on the pets row, per spec §7 and
// AGENTS.md → "Privacy tiers".
//
// Privacy posture (active pets): NO owner PII, NO microchip number, NO medical
// details, NO scan history.
//
// Security (V1-1): per-IP rate limit enforced before ANY data is fetched.
// Limit: 30 req/min, 200 req/hour per IP. Generous enough that a real QR scan
// (one person refreshing a single page) is never affected; tight enough to stop
// enumeration of the 31^8 token keyspace from a single IP. On rate-limit the
// page renders a soft throttle notice (not a 429 hard error) to preserve UX.
// Token entropy widening is tracked as a follow-up (would invalidate existing tokens).

import { Icon } from "@/components/Icon";
import { PppPublicBadge } from "@/components/PppPublicBadge";
import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import { PublicLostSections, formatLostSince } from "@/components/pet-profile/PublicLostSections";
import { LnVstamp } from "@/components/ui/StatusFlag";
import {
  type Pet,
  attachments,
  cases,
  db,
  organizations,
  ownerships,
  petEvents,
  petServiceDog,
  pets,
  profiles,
} from "@/db";
import { readPoint } from "@/lib/domain/location";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { petPhotoUrl } from "@/lib/infra/storage";
import {
  type PermanentCondition,
  isPermanentCondition,
  permanentConditionShortLabel,
  resolveLostSpecialConditions,
} from "@/lib/reference/permanent-conditions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRANDING } from "@/lib/ui/branding";
import { derivePetSituation } from "@/lib/ui/pet-situation";
import {
  AR_TIME_ZONE,
  sexLabel,
  situationLabelForSex,
  speciesLabel,
  statusLabel,
} from "@/lib/utils/format";
import { withDbBudget, withDbBudgetOrThrow } from "@/src/modules/panorama/application/db-budget";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CredentialOriginOrg,
  CredentialTier2Medical,
  CredentialTier2MedicalSkeleton,
} from "./CredentialStreamedSections";
import { DegradedCredentialCard } from "./DegradedCredentialCard";
import { FoundPetForm } from "./FoundPetForm";
import { ScanLogger } from "./ScanLogger";
import { type CredentialEvent, deriveRabiesSemaphore, isRabiesAtRisk } from "./credential-badges";

// The page calls headers() at runtime — mark it dynamic explicitly so Next.js
// does not attempt to statically render it (matches the sibling encontre /
// sighting pages that also carry this export).
//
// Cache policy: ALWAYS LIVE. force-dynamic + `Cache-Control: no-store` (stamped
// in middleware for the /p/ subtree — see lib/infra/public-cache-policy.ts).
// This credential flips active↔lost and, in lost mode, discloses the owner's
// phone / last-seen location; a shared/CDN cache was serving a found pet as
// "SE BUSCA" + phone at the exact QR URL. no-store guarantees the lost→found /
// disclosure change is visible immediately, so no per-action revalidation of
// this public URL is needed.
export const dynamic = "force-dynamic";

/**
 * Open Graph metadata for share previews (task #43, share-first lost flow).
 * When a lost-pet link lands in a WhatsApp chat or a barrio Facebook group,
 * this preview card — photo, urgent title — is what carries the message; a
 * bare URL gets scrolled past.
 *
 * Privacy: name, species and photo only — the same Tier 0 subset the page
 * itself shows to anyone. No owner PII, no location.
 *
 * og:image is NOT set here — deliberately. `opengraph-image.tsx` (sibling
 * file in this route segment) generates the branded SE BUSCA / credencial
 * card automatically via Next's file convention. Setting `openGraph.images`
 * in this config-based metadata would take precedence over that file and
 * silently disable it, so this only carries the non-image OG fields.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  // Budgeted + fail-soft: a DB failure here must not 500 the QR page — the
  // page body has its own degraded render, so metadata degrades to the
  // generic title instead of taking the whole response down with it.
  let row: { name: string; species: Pet["species"]; status: Pet["status"] } | undefined;
  try {
    [row] = await withDbBudgetOrThrow(
      (async () =>
        db
          .select({
            name: pets.name,
            species: pets.species,
            status: pets.status,
          })
          .from(pets)
          .where(eq(pets.publicToken, publicToken))
          .limit(1))(),
      METADATA_BUDGET_MS,
      "GET /p/[publicToken] metadata",
    );
  } catch (err) {
    reportError("public-credential/metadata", err, { publicToken });
    return { title: "Credencial | MiMAR" };
  }
  if (!row) return { title: "Credencial | MiMAR" };

  const isLost = row.status === "lost";
  const title = isLost ? `SE BUSCA: ${row.name} | MiMAR` : `${row.name} | Credencial MiMAR`;
  const description = isLost
    ? `${row.name} (${speciesLabel(row.species)}) está perdida. Si la viste, tocá para avisarle a su familia.`
    : `Credencial pública de ${row.name} (${speciesLabel(row.species)}), verificable por QR.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/p/${publicToken}`,
      siteName: BRANDING.appName,
    },
    twitter: {
      // opengraph-image.tsx always produces an image now (branded fallback
      // even without a real photo), so this is unconditional.
      card: "summary_large_image",
      title,
      description,
    },
  };
}

// Per-IP limit for the public credential read path.
// 60/min: generous enough for a legitimate user refreshing in a noisy carrier-
//   grade NAT environment (many users behind one IP) or a viral lost-pet post
//   getting rapid repeat scans from the same household.
// 400/hr: proportionally raised from 200/hr to match the higher per-minute cap
//   while still blocking sustained enumeration from a single IP.
// A truly viral lost-pet QR gets scans from MANY different IPs, so per-IP
// limiting never blocks that case even at these raised limits.
const PUBLIC_TOKEN_PAGE_LIMIT = { maxPerMinute: 60, maxPerHour: 400 } as const;

// DB time budgets (public-surface resilience). The QR credential is the one
// page an anonymous finder in the street depends on — it must NEVER hang with
// a degraded DB or crash on a DB failure. Every read is bounded (withDbBudget
// family) and every failure path renders <DegradedCredentialCard> instead of
// the 500 error boundary. Budgets are generous for the shared micro DB under
// load, short enough that the finder gets an honest degraded card, not a spin.
const RATE_LIMIT_BUDGET_MS = 1500;
const METADATA_BUDGET_MS = 2500;
const PET_ROW_BUDGET_MS = 3000;
const VIEW_DATA_BUDGET_MS = 5000;

async function callerIpFromHeaders(): Promise<string> {
  try {
    const reqHeaders = await headers();
    return callerIp(reqHeaders);
  } catch {
    return "unknown";
  }
}

export default async function PublicCredentialPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  // V1-1: rate-limit per IP before touching any pet data. Renders a soft
  // throttle notice (not a hard 500) so the page gracefully degrades.
  // FAIL-OPEN on limiter infrastructure failure (budgeted, like /api/health):
  // the limiter is itself a DB write — when the DB is degraded it must not be
  // the thing that crashes the page before the degraded render can happen.
  const ip = await callerIpFromHeaders();
  try {
    await withDbBudget(
      enforceRateLimit("public_token_page", ip, PUBLIC_TOKEN_PAGE_LIMIT).then(() => null),
      RATE_LIMIT_BUDGET_MS,
      "GET /p/[publicToken] rate-limit",
      null,
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return <ThrottleNotice />;
    }
    reportError("public-credential/rate-limit", err, { publicToken });
    // fall through — the pet-row read below has its own degraded path.
  }

  // Pet row — the ONE read the degraded card depends on for name/status. On
  // failure or budget exhaustion, degrade honestly (never notFound(): a DB
  // outage is not "this token does not exist").
  let result: { pet: Pet; photo: typeof attachments.$inferSelect | null } | undefined;
  try {
    [result] = await withDbBudgetOrThrow(
      (async () =>
        db
          .select({ pet: pets, photo: attachments })
          .from(pets)
          .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
          .where(eq(pets.publicToken, publicToken))
          .limit(1))(),
      PET_ROW_BUDGET_MS,
      "GET /p/[publicToken] pet-row",
    );
  } catch (err) {
    reportError("public-credential/pet-row", err, { publicToken });
    return <DegradedCredentialCard publicToken={publicToken} />;
  }

  if (!result) notFound();
  const { pet, photo } = result;
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // ---------------------------------------------------------------------------
  // Every remaining DB read (Stage 1 fan-out, amendments, service-dog row,
  // lost-mode context, tattoo photo) now lives in loadCredentialViewData —
  // same queries, only the await boundary moved — so ONE budget bounds the
  // whole fan-out. On failure or budget exhaustion the page renders the honest
  // degraded card (name + token + lost CTAs) instead of the 500 boundary.
  // ---------------------------------------------------------------------------
  let data: CredentialViewData;
  try {
    data = await withDbBudgetOrThrow(
      loadCredentialViewData(pet),
      VIEW_DATA_BUDGET_MS,
      "GET /p/[publicToken] view-data",
    );
  } catch (err) {
    reportError("public-credential/view-data", err, { publicToken });
    return (
      <DegradedCredentialCard
        publicToken={publicToken}
        petName={pet.name}
        petSex={pet.sex}
        isLost={pet.status === "lost"}
        allowFinderForm={pet.allowFinderFormWhenLost}
      />
    );
  }
  const {
    canonicalIds,
    hasVaccinations,
    latestVaccinationRows,
    openCustodyEpisodeRows,
    rabiesEvents,
    serviceDog,
    lostContext,
    lostTattooPhotoUrl,
  } = data;

  // Tri-state antirrábica vigencia for the identity grid (R4). One boolean of
  // the single legally-mandated vaccine — no dates, no vet, no other vaccine
  // (privacy proportionality argued in the spec).
  const rabiesSemaphore = deriveRabiesSemaphore(rabiesEvents, new Date());

  const hasMicrochip = canonicalIds.microchip !== null;
  const hasTattoo = canonicalIds.tattoo !== null;

  const [latestVaccination] = latestVaccinationRows;

  const latestVaccinationTier = latestVaccination
    ? computeConfidence({
        authorRole: latestVaccination.authorRole,
        authorVerified: latestVaccination.authorVerified,
        authorOrganizationId: latestVaccination.authorOrganizationId,
        payload: (latestVaccination.payload ?? {}) as Record<string, unknown>,
      })
    : null;

  // Gate: only institutional_verified or professional_verified (plan §A.4)
  const showVaccinationConfidence =
    latestVaccinationTier !== null && isAtLeast(latestVaccinationTier, "professional_verified");

  // Approximate age — year only (Tier 0 doesn't expose exact DOB).
  const ageYears = pet.dateOfBirth
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(pet.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        ),
      )
    : null;

  const isLost = pet.status === "lost";

  // DC13: Public custody disclaimer — rendered when the pet has an open
  // custody_episode case opened by a sanitary_authority org (state seizure).
  // Discriminator: caseKind='custody_episode' + opener.orgType='sanitary_authority'.
  // Never parsed from notes text — canonical discriminator only. No owner PII is
  // exposed: only the authority name and a generic disclaimer. The query itself
  // ran in the Stage 1 Promise.all above (it only needs pet.id).
  const [openCustodyEpisode] = openCustodyEpisodeRows;

  const isUnderOfficialCustody = !!openCustodyEpisode;

  // Tier 2 público — owner-opt-in. Active when either:
  //   • tier2PublicPermanent is true ("siempre" option, no expiry), or
  //   • tier2PublicEnabledUntil is a future timestamp (bounded window).
  // See app/actions/tier2-public.ts + migrations 0049 / 0098.
  const tier2EnabledUntil = pet.tier2PublicEnabledUntil
    ? new Date(pet.tier2PublicEnabledUntil)
    : null;
  const tier2Active =
    pet.tier2PublicPermanent || (!!tier2EnabledUntil && tier2EnabledUntil > new Date());

  // #16a — the Tier-2 medical projection (FULL vaccination history + medications
  // + sterilization, folded with event_amended corrections) is the heaviest read
  // on this page. It no longer blocks the credential shell / LCP photo: it moved
  // into <CredentialTier2Medical>, streamed behind <Suspense> in the active
  // render below. `tier2Active` (a pet-row flag) still gates it here so the
  // skeleton only ever shows for tier2-enabled pets.

  // Service dog banner (Ley 26.858). Renders ONLY when the owner has opted
  // in to full_banner visibility AND the credential is vigente AND in
  // service AND the type is one of the five ANDIS-recognized categories
  // ('otro' explicitly never banners). The 60-day rabies expiry sub-warning
  // is computed below. (Row fetched in loadCredentialViewData.)
  const showServiceDogBanner =
    serviceDog &&
    serviceDog.credentialStatus === "vigente" &&
    serviceDog.inService &&
    serviceDog.publicVisibility === "full_banner" &&
    serviceDog.serviceType !== "otro";

  // Art. 8 risk: rabies vaccination must be up to date for the credential
  // to remain compliant. We surface this as a sub-warning on the banner
  // without auto-revoking (revocation belongs to ANDIS).
  // Heuristic: the most recent vaccine with a past `next_due_at`, IF it is a
  // rabies dose, flags risk. The CORRECTED name/due date is read (WAVE D1) so
  // amending a mistyped rabies dose flips the public warning. Conservative —
  // false negatives OK, false positives only show a soft warning. Reuses the
  // hoisted rabiesEvents fetch (pet-state-header R4) — no extra query.
  const rabiesAtRisk = showServiceDogBanner ? isRabiesAtRisk(rabiesEvents, new Date()) : false;

  // Tier 1 reveal (lostContext) is resolved inside loadCredentialViewData —
  // only when the pet is marked lost, each field gated by the owner's
  // disclose_*_when_lost preference. Active pets expose NO owner PII.

  // Lost-mode extras — pet-state-header R3.1 retired the LostPublicCredential
  // full-page takeover: lost pets render the SAME single card below, with these
  // sections in the body. lostSince falls back to now() when the lost event row
  // is missing (shouldn't happen, but defensive).
  let lostSpecialConditions: ReturnType<typeof resolveLostSpecialConditions> = null;
  let lostIdentityLine = "";
  if (isLost && lostContext) {
    lostIdentityLine = [speciesLabel(pet.species), pet.color, pet.distinguishingFeatures]
      .filter(Boolean)
      .join(" · ");

    // Welfare-safety disclosure: permanent conditions (blind, deaf, medicated,
    // etc.) on the LOST credential. Gated ONLY by discloseConditionsPublicly —
    // same gate the active-credential banner and Tier-2 medical view use for
    // this field; a finder handling a special-needs pet must be told.
    lostSpecialConditions = resolveLostSpecialConditions(
      pet.permanentConditions,
      pet.permanentConditionsOther,
      pet.discloseConditionsPublicly,
    );
  }

  // PUBLIC-SAFE masthead situation (pet-state-header R3.3, privacy checklist).
  // The derivation is fed ONLY the public-safe signals: status (lost/deceased),
  // rabies observation (already public on this page) and official custody
  // (already public via the DC13 disclaimer). Medical/household states
  // (en-tratamiento, prenada, en-adopcion, en-transito) are STRUCTURALLY
  // unreachable here — their inputs are never passed — so the public masthead
  // can never tint for them (Tier 0 exposes no medical/household state).
  const publicSituationRaw = derivePetSituation({
    status: pet.status,
    rabiesObservationStatus: pet.rabiesObservationStatus,
    underOfficialCustody: isUnderOfficialCustody,
  });
  const publicSituation = publicSituationRaw.isDefault ? null : publicSituationRaw;

  // ---------------------------------------------------------------------------
  // Credential — LN "warm libreta / document credential" render (single card
  // for active AND lost pets; the masthead carries the situation).
  // ---------------------------------------------------------------------------

  const breedLine = [speciesLabel(pet.species), pet.breed, sexLabel(pet.sex)]
    .filter(Boolean)
    .join(" · ");
  const ageLabel = ageYears !== null ? `${ageYears} año${ageYears === 1 ? "" : "s"}` : null;

  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="min-h-screen bg-ln-paper font-[var(--font-ln-sans)]">
      {/* Lost mode: ScanLogger also renders the visible location-consent prompt
          so a finder can share precise GPS (Task #45). Active credentials never
          prompt — the server rejects coords for non-lost pets anyway. */}
      {isLost ? (
        <ScanLogger publicToken={publicToken} isLost petName={pet.name} />
      ) : (
        <ScanLogger publicToken={publicToken} />
      )}

      {/* Guilloché band — LN security stripe */}
      <div
        aria-hidden="true"
        className="h-[4px] flex-shrink-0 opacity-90"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />

      <div className="mx-auto max-w-[460px] px-4 py-6 pb-14">
        {/* ------------------------------------------------------------------ */}
        {/* TIER 0+ emergency-info banner — sticky on mobile, always visible.  */}
        {/* Non-hideable by design: the medical alert is the point of 0+.      */}
        {/* Sprint 5 PR-042 / doc 10 §3 punto 4.                               */}
        {/* ------------------------------------------------------------------ */}
        {pet.emergencyInfoVisible && (
          <div
            role="alert"
            data-section="emergency-banner"
            className="sticky top-0 z-30 -mx-4 mb-4 flex items-start gap-[11px] border-b border-ln-err-100 bg-ln-err-050 px-[18px] py-[13px] md:static md:mx-0 md:mb-4 md:rounded-[var(--radius-sm)]"
          >
            {/* Heartbeat icon */}
            <span aria-hidden="true" className="mt-px flex-shrink-0 text-ln-seal">
              <Icon name="corazon" size="md" decorative />
            </span>
            <div>
              <p className="m-0 font-[var(--font-ln-serif)] text-md font-semibold text-ln-ink">
                Alerta médica
              </p>
              <p className="mt-0.5 text-sm leading-[1.45] text-ln-ink-2">
                Esta mascota requiere atención médica. Contactá al dueño escaneando el QR.
              </p>
            </div>
          </div>
        )}

        {/* DC13: Official custody disclaimer */}
        {isUnderOfficialCustody && (
          <div
            role="alert"
            data-section="custody-disclaimer"
            className="mb-4 rounded-[var(--radius-sm)] border border-ln-warn-100 border-l-[3px] border-l-ln-warn bg-ln-warn-050 px-4 py-3"
          >
            <p className="mb-1 font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-warn">
              Custodia oficial
            </p>
            <p className="m-0 text-[13.5px] font-semibold text-ln-ink">
              Esta mascota está bajo custodia oficial.
            </p>
            {openCustodyEpisode?.authorityName && (
              <p className="mt-1 text-sm text-ln-ink-2">
                Autoridad a cargo: {openCustodyEpisode.authorityName}
              </p>
            )}
            <p className="mt-1 text-[11.5px] text-ln-mute">
              Comunicate con la autoridad sanitaria competente para más información.
            </p>
          </div>
        )}

        {/* Permanent conditions banner — active pets only: in lost mode the
            in-card special-conditions section (PublicLostSections) carries the
            same disclosure with finder-welfare framing; both are keyed on the
            same discloseConditionsPublicly gate. */}
        {!isLost && pet.discloseConditionsPublicly && pet.permanentConditions.length > 0 && (
          <PermanentConditionsBanner
            codes={pet.permanentConditions}
            other={pet.permanentConditionsOther}
          />
        )}

        {/* PPP badge — Ley CABA 4078 / Ley Prov 14.107 */}
        {pet.potentiallyDangerousBreed && (
          <div className="mb-4">
            <PppPublicBadge petName={pet.name} breed={pet.breed ?? null} />
          </div>
        )}

        {/* Active rabies observation — public-safety signal (no PII). A vecino
            scanning a dog currently under a 10-day observation must see it. */}
        {pet.rabiesObservationStatus === "in_progress" && <RabiesObservationBanner />}

        {/* Service dog banner — Ley 26.858 */}
        {showServiceDogBanner && <ServiceDogBanner rabiesAtRisk={rabiesAtRisk} />}

        {/* ------------------------------------------------------------------ */}
        {/* CREDENTIAL CARD                                                     */}
        {/* ------------------------------------------------------------------ */}
        <div
          className="pc-cred overflow-hidden rounded-[var(--radius-input)] border border-ln-line-strong bg-ln-card shadow-[0_6px_18px_rgba(20,40,60,.08)]"
          data-situation={publicSituation?.key}
        >
          {/* Guilloché top band — the 8px strip is half the public masthead
              (pet-state-header D2): its default background lives in .pc-strip
              (globals.css) so the .pc-cred[data-situation] variants can recolor
              it per situation. */}
          <div aria-hidden="true" className="pc-strip h-[8px]" />

          {/* Official header row: crest + brand + tier chip (+ situation chip) */}
          <div className="pc-head flex flex-wrap items-center gap-2 border-b border-ln-line-2 px-4 py-2.5">
            {/* Crest circle */}
            <div
              aria-hidden="true"
              className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full border-[1.5px] border-ln-azul bg-ln-celeste-050 font-[var(--font-ln-serif)] text-sm font-semibold text-ln-azul"
            >
              m
            </div>
            <div className="min-w-0 flex-1">
              <span className="font-[var(--font-ln-serif)] text-[13px] font-semibold text-ln-ink">
                MiMAR
              </span>
              <span className="block font-[var(--font-ln-mono)] text-[8px] uppercase tracking-[.14em] text-ln-mute">
                Credencial pública
              </span>
            </div>
            {/* Tier chip */}
            <span
              className={`rounded-full border px-2 py-[3px] font-[var(--font-ln-mono)] text-[9px] font-semibold tracking-[.08em] ${tier2Active ? "border-ln-ok-100 bg-ln-ok-050 text-ln-ok" : "border-ln-celeste-100 bg-ln-celeste-050 text-ln-azul"}`}
            >
              {tier2Active ? "NIVEL 2 · DATOS MÉDICOS" : "NIVEL 0 · IDENTIDAD"}
            </span>
            {/* Situation chip (pet-state-header R3.2) — icon + gendered label,
                never color alone. role="alert" only for perdida: a finder must
                hear the urgent state immediately; the other public states are
                informational. Recency rides the chip for lost pets. */}
            {publicSituation && (
              <span
                className="pc-sit-chip"
                data-section="masthead-situation-chip"
                role={publicSituation.key === "perdida" ? "alert" : undefined}
              >
                <Icon name={publicSituation.icon} size="sm" decorative />
                {situationLabelForSex(publicSituation.label, pet.sex)}
                {isLost && lostContext && (
                  <span className="pc-sit-chip-recency">
                    · {formatLostSince(lostContext.lostSince ?? new Date())}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Photo — LCP element on the busiest path in the product (every QR
              scan lands here, mostly mobile). next/image `priority` preloads +
              eager-loads it, preserving the deliberate eager LCP choice, while
              the optimizer serves a device-sized WebP — byte-smaller than the
              raw Supabase original on a phone, never larger. `sizes` reflects the
              card: full-width up to the 460px cap. The Supabase storage host is
              allowlisted in next.config (images.remotePatterns). */}
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt={pet.name}
              width={460}
              height={345}
              priority
              sizes="(max-width: 480px) 100vw, 460px"
              className="block w-full aspect-[4/3] object-cover"
            />
          ) : (
            <div
              className="grid w-full place-items-center aspect-[4/3]"
              style={{
                background: "repeating-linear-gradient(135deg,#e7e2d6 0 11px,#f1eee5 11px 22px)",
              }}
            >
              <span className="font-[var(--font-ln-serif)] text-[56px] font-semibold text-ln-mute">
                {pet.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          {/* Name bar */}
          <div className="px-4 pt-[15px] pb-3">
            {/* h1: this is the most-scanned public page in the product (QR landing) —
                it must expose a page-level heading (WCAG 1.3.1 / 2.4.6). */}
            <h1 className="flex items-center gap-[9px] font-[var(--font-ln-serif)] text-[27px] font-semibold leading-none tracking-[-0.02em] text-ln-ink">
              {pet.name}
              {/* Status dot — default green; .pc-cred[data-situation] retints
                  it (a green "all good" dot next to a lost pet's name would
                  contradict the masthead). Decorative: the chip + identity grid
                  carry the state as text. */}
              <span
                aria-hidden="true"
                className="pc-dot inline-block h-[11px] w-[11px] flex-shrink-0 rounded-full bg-ln-ok shadow-[0_0_0_3px_#e8f3ec]"
              />
            </h1>
            <p className="mt-[5px] text-[13px] text-ln-ink-2">
              {breedLine}
              {ageLabel && ` · ${ageLabel}`}
            </p>
          </div>

          {/* Lost body sections (pet-state-header R3.4) — CTA row + última vez
              vista + tattoo + description + welfare box, directly under the
              name bar. Every disclosure gate resolved server-side above. */}
          {isLost && lostContext && (
            <PublicLostSections
              petName={pet.name}
              petSex={pet.sex}
              identityLine={lostIdentityLine}
              ownerFirstName={pet.discloseFirstNameWhenLost ? lostContext.ownerFirstName : null}
              ownerPhoneE164={pet.disclosePhoneWhenLost ? lostContext.phone : null}
              ownerEmail={pet.discloseEmailWhenLost ? lostContext.email : null}
              lastSeenPlaceName={pet.discloseLastLocationWhenLost ? lostContext.locationText : null}
              lastSeenLocality={
                pet.discloseLastLocationWhenLost ? (pet.jurisdictionLocality ?? null) : null
              }
              distinguishingFeatures={pet.distinguishingFeatures}
              finderFormHref={pet.allowFinderFormWhenLost ? `/p/${publicToken}/encontre` : null}
              sightingFormHref={`/p/${publicToken}/sighting`}
              lastSeenLat={pet.discloseLastLocationWhenLost ? lostContext.lostLat : null}
              lastSeenLng={pet.discloseLastLocationWhenLost ? lostContext.lostLng : null}
              lostSince={lostContext.lostSince ?? new Date()}
              tattooCode={canonicalIds.tattoo?.code ?? null}
              tattooLocation={canonicalIds.tattoo?.tattooLocation ?? null}
              tattooDescription={canonicalIds.tattoo?.tattooDescription ?? null}
              tattooPhotoUrl={lostTattooPhotoUrl}
              lostDescription={lostContext.lostDescription}
              specialConditions={lostSpecialConditions}
            />
          )}

          {/* Tier 2 enabled notice */}
          {tier2Active && (
            <div className="flex items-center gap-[7px] border-t border-ln-celeste-100 bg-ln-celeste-050 px-4 py-2.5 font-[var(--font-ln-mono)] text-xs leading-[1.5] tracking-[.02em] text-ln-azul-700">
              <Icon name="unlock" size="sm" decorative />
              {pet.tier2PublicPermanent
                ? "El dueño habilitó la libreta médica de forma permanente"
                : tier2EnabledUntil
                  ? `El dueño habilitó la libreta médica hasta el ${tier2EnabledUntil.toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: AR_TIME_ZONE })}`
                  : null}
            </div>
          )}

          {/* Tier 2 medical summary — STREAMED (#16a). The shell (photo, name,
              identity) paints first; this heavy vaccination projection streams in
              behind a skeleton that reserves its height so the sections below do
              not jump. Same rendered output as the former inline block. */}
          {tier2Active && (
            <Suspense fallback={<CredentialTier2MedicalSkeleton />}>
              <CredentialTier2Medical
                petId={pet.id}
                sex={pet.sex}
                species={pet.species}
                jurisdictionProvince={pet.jurisdictionProvince}
                jurisdictionLocality={pet.jurisdictionLocality}
                enabledUntil={tier2EnabledUntil}
                permanentConditions={pet.permanentConditions ?? []}
                permanentConditionsOther={pet.permanentConditionsOther}
              />
            </Suspense>
          )}

          {/* Identity section */}
          <div className="border-t border-ln-line-2 px-4 py-[13px]">
            <p className="mb-[9px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-mute">
              Identidad registrada
            </p>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-[11px]">
              <CredField label="Credencial" value={statusLabel(pet.status)} mono={false} />
              <CredField
                label="Vacunación"
                value={hasVaccinations ? "Con registros" : "Sin registros"}
                mono={false}
              />
              {/* Rabies semaphore (pet-state-header R4) — tri-state vigencia of
                  the single legally-mandated vaccine (Ley 22.953 framework).
                  LnVstamp for vigente/vencida (icon-free stamp + text label —
                  never color alone); plain honest text otherwise. No dates on
                  Tier 0. */}
              <div data-section="rabies-semaphore">
                <p className="m-0 font-[var(--font-ln-mono)] text-xs uppercase tracking-[.06em] text-ln-faint">
                  Antirrábica
                </p>
                <p className="mt-px text-md font-medium text-ln-ink">
                  {rabiesSemaphore === "vigente" ? (
                    <LnVstamp variant="ok" />
                  ) : rabiesSemaphore === "vencida" ? (
                    <LnVstamp variant="over" />
                  ) : rabiesSemaphore === "sin-vencimiento" ? (
                    "Con registro"
                  ) : (
                    "Sin registro"
                  )}
                </p>
              </div>
              <CredField label="Microchip" value={hasMicrochip ? "Sí" : "No"} mono={false} />
              <CredField label="Tatuaje" value={hasTattoo ? "Sí" : "No"} mono={false} />
              <CredField label="Libreta" value={`LIB-AR-${pet.publicToken.toUpperCase()}`} mono />
            </div>
          </div>

          {/* A.4: Vaccination confidence badge */}
          {showVaccinationConfidence && latestVaccinationTier && (
            <div className="flex items-center gap-2 border-t border-ln-line-2 px-4 py-2.5">
              <span className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.08em] text-ln-mute">
                Vacunación:
              </span>
              <ConfidenceBadge tier={latestVaccinationTier} />
            </div>
          )}

          {/* T-4.3: Origin-org badge — STREAMED (#16a). Below the fold and off
              the LCP path; resolveOriginOrg walks up to three rows. null fallback
              — the badge is absent for most pets, so a skeleton would only flash
              then vanish. Same resolver + gate + markup as the former block. */}
          <Suspense fallback={null}>
            <CredentialOriginOrg petId={pet.id} />
          </Suspense>

          {/* "Found this pet?" action area */}
          <div className="border-t border-ln-line bg-ln-stripe px-4 py-3.5">
            <details className="group">
              <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3">
                <div>
                  <p className="m-0 font-[var(--font-ln-serif)] text-md font-semibold text-ln-ink">
                    ¿Encontraste a esta mascota?
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ln-mute">
                    Tocá acá para avisarle al dueño.
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="flex-shrink-0 text-lg text-ln-mute transition-transform group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              <div className="mt-3 border-t border-ln-line pt-3.5">
                <FoundPetForm publicToken={publicToken} />
              </div>
            </details>
          </div>

          {/* Credential footer */}
          <div className="px-4 py-3 text-center font-[var(--font-ln-mono)] text-[9.5px] leading-[1.7] tracking-[.02em] text-ln-faint">
            CREDENCIAL PÚBLICA · MiMAR · Registro Nacional de Mascotas
            <br />
            {pet.publicToken.toUpperCase()} · República Argentina
          </div>
        </div>
        {/* END CREDENTIAL CARD */}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// loadCredentialViewData — ALL post-pet-row DB reads in one budgeted unit.
// The page wraps this call in withDbBudgetOrThrow so a degraded DB yields the
// honest degraded card instead of a hang or a 500. The queries are byte-for-
// byte the former inline stages — only the await boundary moved.
// ---------------------------------------------------------------------------

type CredentialViewData = Awaited<ReturnType<typeof loadCredentialViewData>>;

async function loadCredentialViewData(pet: Pet) {
  // WAVE D1 (Invariant #3): every clinical badge folds `event_amended`
  // corrections via overlayAmendments so a stranger scanning the QR sees the
  // CORRECTED value — same projection the authenticated libreta applies. This
  // shell-side cache now serves only the service-dog rabies warning; the
  // streamed Tier-2 section fetches its own copy (#16a) — at most one extra
  // query, only for the rare tier2-AND-bannered-service-dog pet.
  let amendmentEventsCache: CredentialEvent[] | null = null;
  const getAmendmentEvents = async (): Promise<CredentialEvent[]> => {
    if (amendmentEventsCache === null) {
      amendmentEventsCache = await db
        .select({
          id: petEvents.id,
          eventType: petEvents.eventType,
          occurredAt: petEvents.occurredAt,
          payload: petEvents.payload,
        })
        .from(petEvents)
        .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "event_amended")));
    }
    return amendmentEventsCache;
  };

  // ---------------------------------------------------------------------------
  // Stage 1 — independent reads keyed only off pet.id, run concurrently.
  // These were previously four sequential awaits (canonical ids, vaccination
  // existence, latest-vaccination provenance, open custody episode). None
  // depends on another's result, so a single Promise.all collapses four
  // round-trips into one. This is the hottest public path (every QR scan), so
  // the round-trip reduction is the biggest win here. The lost / tier2 / service
  // -dog reads stay in later conditional stages because they gate on derived
  // flags (isLost, tier2Active, species).
  // ---------------------------------------------------------------------------
  const [
    canonicalIds,
    vaccinationExists,
    latestVaccinationRows,
    openCustodyEpisodeRows,
    rabiesVaccinationRows,
  ] = await Promise.all([
    // Canonical identifier rows — boolean indicators + lost-branch display.
    fetchActiveIdentifications(pet.id),
    // Tier 0 vaccination rollup — only a boolean is needed, so LIMIT 1 instead
    // of fetching the pet's entire vaccination history just to test existence.
    db
      .select({ id: petEvents.id })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")))
      .limit(1),
    // A.4: most recent vaccination's provenance to compute the confidence tier.
    db
      .select({
        authorRole: petEvents.authorRole,
        authorVerified: petEvents.authorVerified,
        authorOrganizationId: petEvents.authorOrganizationId,
        payload: petEvents.payload,
      })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")))
      .orderBy(desc(petEvents.occurredAt))
      .limit(1),
    // DC13: open custody_episode opened by a sanitary_authority org.
    db
      .select({
        caseId: cases.id,
        authorityName: organizations.displayName,
      })
      .from(cases)
      .innerJoin(
        organizations,
        and(
          eq(organizations.id, cases.openedByOrganizationId),
          eq(organizations.orgType, "sanitary_authority"),
        ),
      )
      .where(
        and(
          eq(cases.primaryPetId, pet.id),
          eq(cases.caseKind, "custody_episode"),
          eq(cases.status, "open"),
        ),
      )
      .limit(1),
    // pet-state-header R4: vaccination rows for the rabies semaphore —
    // HOISTED out of the showServiceDogBanner guard so one bounded fetch
    // serves BOTH the semaphore and the service-dog rabies warning (net zero
    // extra vaccination queries when the banner already fired).
    db
      .select({
        id: petEvents.id,
        eventType: petEvents.eventType,
        occurredAt: petEvents.occurredAt,
        payload: petEvents.payload,
      })
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "vaccination_administered")))
      .orderBy(desc(petEvents.occurredAt))
      .limit(50),
  ]);

  // Corrections fold into the semaphore + banner (WAVE D1) — one fetch, cached
  // for any later consumer (the streamed Tier-2 section fetches its own copy).
  const rabiesEvents = [...rabiesVaccinationRows, ...(await getAmendmentEvents())];

  // Service-dog row — only queried for dogs (Ley 26.858 scope).
  const [serviceDog] =
    pet.species === "dog"
      ? await db.select().from(petServiceDog).where(eq(petServiceDog.petId, pet.id)).limit(1)
      : [];

  const isLost = pet.status === "lost";

  // Tier 1 reveal: only when the pet is marked lost. Each field is gated by
  // the owner's disclosure preference (disclose_*_when_lost columns on pets).
  // Active pets expose NO owner PII — leave lostContext null.
  //
  // lost_description is always visible if present — these are animal details,
  // not owner contact info, so no disclosure pref gates them (spec §8.4 / §10).
  let lostContext: {
    ownerFirstName: string | null;
    phone: string | null;
    email: string | null;
    locationText: string | null;
    lostLat: number | null;
    lostLng: number | null;
    lostDescription: {
      accessoriesWhenLost: string | null;
      behaviorNotes: string | null;
      lastSeenContext: string | null;
    } | null;
    lostSince: Date | null;
  } | null = null;

  if (isLost) {
    // S4 defense-in-depth: only FETCH what the owner opted to disclose. Location
    // (free-text + lat/lng) and phone are pulled from Postgres only when their
    // disclosure flag is set — not fetched-then-redacted. Mirrors the query-level
    // split in lost-listing-read.ts. lost_description (animal identity) and
    // lostSince are always shown, so they are always fetched.
    const showLocation = pet.discloseLastLocationWhenLost;
    const showPhone = pet.disclosePhoneWhenLost;

    const [ownerRows, latestLostEventRows] = await Promise.all([
      db
        .select({
          displayName: profiles.displayName,
          // phone never leaves the DB unless the owner disclosed it.
          phone: showPhone ? profiles.phone : sql<string | null>`null`,
          ownerUserId: ownerships.ownerUserId,
        })
        .from(ownerships)
        .innerJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
        .limit(1),
      // Last-known location from the most recent status_changed → lost event.
      // Filtering on payload->>'to_status' = 'lost' so a later "found" event
      // (to_status='active') does not eclipse the actual lost-event payload.
      // Location keys/columns are projected as SQL NULL when not disclosed, so
      // the raw payload and coordinates never enter server memory.
      db
        .select({
          lostDescriptionJson: sql`${petEvents.payload}->'lost_description'`,
          locationText: showLocation
            ? sql<
                string | null
              >`coalesce(${petEvents.payload}->>'location_description', ${petEvents.payload}->>'last_known_location')`
            : sql<string | null>`null`,
          locationLat: showLocation ? petEvents.locationLat : sql<number | null>`null`,
          locationLng: showLocation ? petEvents.locationLng : sql<number | null>`null`,
          occurredAt: petEvents.occurredAt,
        })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            eq(petEvents.eventType, "status_changed"),
            sql`${petEvents.payload}->>'to_status' = 'lost'`,
          ),
        )
        .orderBy(desc(petEvents.occurredAt))
        .limit(1),
    ]);
    const [ownerRow] = ownerRows;
    const [latestLostEvent] = latestLostEventRows;

    const textLocation =
      typeof latestLostEvent?.locationText === "string" && latestLostEvent.locationText.length > 0
        ? latestLostEvent.locationText
        : null;
    // Fallback: precise lat/lng captured on the event row itself (null unless disclosed).
    const eventPoint = latestLostEvent ? readPoint(latestLostEvent) : null;
    const geoLocation =
      !textLocation && eventPoint
        ? `${eventPoint.lat.toFixed(6)}, ${eventPoint.lng.toFixed(6)}`
        : null;

    // Split display_name on first whitespace to get just the first name. We
    // never expose the full legal name on a public credential.
    // Guard at resolution: only derive when the owner opted in.
    const firstName =
      pet.discloseFirstNameWhenLost && ownerRow?.displayName
        ? ownerRow.displayName.trim().split(/\s+/)[0]
        : null;

    // Email is stored in auth.users (not profiles). Only fetch it when the
    // owner has opted in — avoids an unnecessary admin API call on every
    // credential page load.
    let ownerEmail: string | null = null;
    if (pet.discloseEmailWhenLost && ownerRow?.ownerUserId) {
      try {
        const adminClient = createAdminClient();
        const { data } = await adminClient.auth.admin.getUserById(ownerRow.ownerUserId);
        ownerEmail = data?.user?.email ?? null;
      } catch (err) {
        // Non-fatal: if email fetch fails, fall through to null (same as
        // if the pref were false). The credential renders without email.
        reportError("public-credential/owner-email", err, { publicToken: pet.publicToken });
        ownerEmail = null;
      }
    }

    // lost_description (spec §8.4) — animal-identity details, always shown if
    // present, no disclosure pref gates them.
    const lostDesc = latestLostEvent?.lostDescriptionJson as
      | {
          accessories_when_lost?: string | null;
          behavior_notes?: string | null;
          last_seen_context?: string | null;
        }
      | null
      | undefined;

    const lostDescription =
      lostDesc &&
      (lostDesc.accessories_when_lost || lostDesc.behavior_notes || lostDesc.last_seen_context)
        ? {
            accessoriesWhenLost: lostDesc.accessories_when_lost ?? null,
            behaviorNotes: lostDesc.behavior_notes ?? null,
            lastSeenContext: lostDesc.last_seen_context ?? null,
          }
        : null;

    lostContext = {
      ownerFirstName: firstName ?? null,
      phone: ownerRow?.phone ?? null,
      email: ownerEmail,
      locationText: textLocation ?? geoLocation,
      lostLat: eventPoint?.lat ?? null,
      lostLng: eventPoint?.lng ?? null,
      lostDescription,
      lostSince: latestLostEvent?.occurredAt ?? null,
    };
  }

  // Tattoo photo — only resolved in lost mode. Active credentials never
  // query this attachment to keep the data surface minimal (D3 closed
  // 2026-05-22 — code + location + photo are gated by lost status, mirroring
  // how the chip number is gated).
  // Photo ID is sourced from the canonical tattoo row (ARCH-Q).
  let lostTattooPhotoUrl: string | null = null;
  if (isLost && lostContext && canonicalIds.tattoo?.photoId) {
    const [tattooPhoto] = await db
      .select({ storagePath: attachments.storagePath })
      .from(attachments)
      .where(eq(attachments.id, canonicalIds.tattoo.photoId))
      .limit(1);
    lostTattooPhotoUrl = petPhotoUrl(tattooPhoto?.storagePath);
  }

  return {
    canonicalIds,
    hasVaccinations: vaccinationExists.length > 0,
    latestVaccinationRows,
    openCustodyEpisodeRows,
    rabiesEvents,
    serviceDog,
    lostContext,
    lostTattooPhotoUrl,
  };
}

// ---------------------------------------------------------------------------
// ThrottleNotice — shown when a single IP exceeds the per-IP read limit.
// Renders a friendly message instead of a hard error. Spanish (es-AR) copy
// per project convention for user-facing copy on public surfaces.
// ---------------------------------------------------------------------------

function ThrottleNotice() {
  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="flex min-h-screen items-center justify-center bg-ln-paper font-[var(--font-ln-sans)]">
      <div className="mx-auto max-w-[400px] px-6 py-12 text-center text-ln-ink">
        <p className="mb-3 font-[var(--font-ln-serif)] text-lg font-semibold">
          Demasiadas consultas
        </p>
        <p className="text-md leading-[1.6] text-ln-ink-2">
          Estás realizando demasiadas consultas desde esta conexión. Esperá unos minutos y volvé a
          intentarlo.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CredField — mono label + value row inside the identity grid
// ---------------------------------------------------------------------------

function CredField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="m-0 font-[var(--font-ln-mono)] text-[9px] uppercase tracking-[.06em] text-ln-faint">
        {label}
      </p>
      <p
        className={`mt-px break-words font-medium text-ln-ink ${
          mono ? "font-[var(--font-ln-mono)] text-sm" : "font-[var(--font-ln-sans)] text-[13.5px]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceDogBanner — Ley 26.858 access notice (LN tone)
// ---------------------------------------------------------------------------

function ServiceDogBanner({ rabiesAtRisk }: { rabiesAtRisk: boolean }) {
  return (
    <section
      aria-label="Banner de acceso — perro de asistencia"
      className="mb-4 rounded-[var(--radius-sm)] border border-ln-celeste-100 border-l-[3px] border-l-ln-azul bg-ln-celeste-050 px-4 py-3.5"
    >
      <p className="mb-1.5 font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-azul">
        Perro de Asistencia
      </p>
      <p className="mb-1.5 font-[var(--font-ln-serif)] text-md font-semibold leading-[1.45] text-ln-ink">
        Esta persona tiene derecho a ingresar, deambular y permanecer con su perro en este
        establecimiento, espacio privado de acceso público y transporte público.
      </p>
      <p className="text-[11.5px] text-ln-ink-2">
        Marco legal: <strong className="text-ln-ink">Arts. 1 y 7, Ley 26.858</strong> · Reg. Decreto
        792/2019 · Credencial RUPGA vigente (Res. ANDIS 2588/2022).
      </p>
      {rabiesAtRisk && (
        <p className="mt-2.5 border-t border-ln-celeste-100 pt-2.5 text-[11.5px] text-ln-warn">
          Aviso: la vacunación antirrábica figura vencida en el registro. La credencial requiere
          mantener la vacunación al día (Art. 8, Ley 26.858).
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// RabiesObservationBanner — active 10-day antirrábica observation (public safety)
// ---------------------------------------------------------------------------
//
// Public-safe, PII-free signal shown to anyone scanning the QR while the pet is
// under an active rabies observation (Decreto 4669/1973 PBA, Ord. CABA 41.831).
// A vecino who was bitten, or who sees the animal, must know it is under formal
// observation and whom to contact. No owner data, no bite details — just the
// state and the safety instruction.
function RabiesObservationBanner() {
  return (
    <section
      role="alert"
      aria-label="Aviso — mascota en observación antirrábica"
      className="mb-4 rounded-[var(--radius-sm)] border border-ln-warn-100 border-l-[3px] border-l-ln-warn bg-ln-warn-050 px-4 py-3"
    >
      <p className="mb-1 font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-warn">
        Observación antirrábica
      </p>
      <p className="m-0 text-[13.5px] font-semibold text-ln-ink">
        Esta mascota está en observación antirrábica activa (período de 10 días).
      </p>
      <p className="mt-1 text-[11.5px] text-ln-mute">
        Si te mordió o tuviste contacto, comunicate con la autoridad sanitaria o el centro
        antirrábico de tu localidad.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PermanentConditionsBanner — special-needs chips (LN tone)
// ---------------------------------------------------------------------------

function PermanentConditionsBanner({
  codes,
  other,
}: {
  codes: string[];
  other: string | null;
}) {
  const safe: PermanentCondition[] = codes.filter(isPermanentCondition);
  if (safe.length === 0) return null;
  const hasOther = safe.includes("otra");
  return (
    <section className="mb-4 rounded-[var(--radius-sm)] border border-ln-celeste-100 border-l-[3px] border-l-ln-azul bg-ln-celeste-050 px-4 py-3">
      <p className="mb-2 font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-azul">
        Necesidades especiales
      </p>
      <div className="flex flex-wrap gap-1.5">
        {safe.map((code) => (
          <span
            key={code}
            className="inline-flex rounded-full bg-ln-azul px-2.5 py-1 text-sm font-semibold text-white"
          >
            {permanentConditionShortLabel(code)}
          </span>
        ))}
      </div>
      {hasOther && other && <p className="mt-1.5 text-sm text-ln-ink-2">{other}</p>}
    </section>
  );
}
