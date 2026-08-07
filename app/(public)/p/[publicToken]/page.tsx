// Public credential page — Tier 0 view by default. When pet.status === 'lost'
// the page promotes to Tier 1: owner contact info governed by the five
// disclose_*_when_lost preference columns on the pets row, per spec §7 and
// AGENTS.md → "Privacy tiers".
//
// Privacy posture (active pets): NO owner PII, NO microchip number, NO medical
// details, NO scan history.
//
// The TATTOO code is the deliberate exception, and only on the lost branch
// (ratified 2026-08-01 after an audit read the omission as an oversight). A
// microchip needs a reader, so publishing its number helps nobody standing over
// the animal and hands a scraper a national identifier. A tattoo is a mark you
// read OFF the animal — withholding it would withhold the one identifier the
// finder can actually match, in the exact situation the Tier 1 promotion exists
// to serve. It stays out of the active-pet view: this is a reunification
// disclosure, not a public property of the credential.
//
// Security (V1-1): per-IP rate limit enforced before ANY data is fetched.
// Limit: 30 req/min, 200 req/hour per IP. Generous enough that a real QR scan
// (one person refreshing a single page) is never affected; tight enough to stop
// enumeration of the 31^8 token keyspace from a single IP. On rate-limit the
// page renders a soft throttle notice (not a 429 hard error) to preserve UX.
// Token entropy widening is tracked as a follow-up (would invalidate existing tokens).

import "./credential-print.css";

import { Icon } from "@/components/Icon";
import { PppPublicBadge } from "@/components/PppPublicBadge";
import { ConfidenceBadge } from "@/components/event/ConfidenceBadge";
import { PublicLostSections, formatLostSince } from "@/components/pet-profile/PublicLostSections";
import { DegradedFallback } from "@/components/ui/DegradedFallback";
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
import { publicPetByToken } from "@/lib/infra/public-pet-lookup";
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
import { DISPUTE_TIP_INTRO } from "@/lib/ui/dispute-copy";
import { derivePetSituation } from "@/lib/ui/pet-situation";
import {
  AR_TIME_ZONE,
  foundPossessivePhrase,
  normalizePhoneForTel,
  pluralizeEs,
  sexLabel,
  sightingPhrase,
  situationLabelForSex,
  speciesLabel,
  statusLabel,
} from "@/lib/utils/format";
import { withDbBudget, withDbBudgetOrThrow } from "@/src/modules/panorama/application/db-budget";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CredentialActionBar,
  type CredentialActionBarProps,
  DISPUTE_SECTION_ID,
  MEDICAL_SECTION_ID,
  REPORT_SECTION_ID,
} from "./CredentialActionBar";
import { CredentialPhoto } from "./CredentialPhoto";
import {
  CredentialOriginOrg,
  CredentialTier2Medical,
  CredentialTier2MedicalSkeleton,
} from "./CredentialStreamedSections";
import { DegradedCredentialCard } from "./DegradedCredentialCard";
import { DisputeTipForm } from "./DisputeTipForm";
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
          .where(publicPetByToken(publicToken))
          .limit(1))(),
      METADATA_BUDGET_MS,
      "GET /p/[publicToken] metadata",
    );
  } catch (err) {
    reportError("public-credential/metadata", err, { publicToken });
    return { title: "Credencial | miMAR" };
  }
  if (!row) return { title: "Credencial | miMAR" };

  const isLost = row.status === "lost";
  const title = isLost ? `SE BUSCA: ${row.name} | miMAR` : `${row.name} | Credencial miMAR`;
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
          // PO-4: soft-deleted pets do not resolve publicly. The filter lives
          // in the QUERY, not in a post-fetch guard — an erased subject's pet
          // row must not be read into server memory at all.
          .where(publicPetByToken(publicToken))
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
    // The identity line is a DESCRIPTION ("Perro · marrón · collar rojo") — it
    // exists so a finder can match the animal in front of them. The species
    // alone describes nothing a finder can use, and it is already stated twice
    // on this card (the breed line under the name, and the "Especie" field in
    // the identity grid), so a pet with no colour and no señas rendered a
    // floating orphan word — "Perro" on its own line (UI review, PO
    // 2026-08-06). Built here rather than hidden at the render site so every
    // consumer of the prop gets the same honest empty string.
    const identityTraits = [pet.color, pet.distinguishingFeatures].filter(Boolean);
    lostIdentityLine =
      identityTraits.length > 0 ? [speciesLabel(pet.species), ...identityTraits].join(" · ") : "";

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
  const ageLabel = ageYears !== null ? `${ageYears} ${pluralizeEs(ageYears, "año")}` : null;

  // Sticky primary CTA (mobile <sm) — cursor citizen review P3: one verb for
  // the street scanner, per state. EVERY disclosure decision is resolved HERE,
  // server-side, so the client bar never receives undisclosed PII:
  //   disputed → NEUTRAL "Tengo información sobre esta mascota" (PO
  //              2026-07-24): opens + scrolls to the dispute-tip form, which
  //              lands on the dispute case for the reviewing authority ONLY.
  //              The D2 hardening (red-team 2026-07) still holds — no relay
  //              CTA of any kind (/encontre, /sighting, tel:) ever surfaces:
  //              those flows end in an owner-directed notification, which
  //              would take sides in a legal dispute. Deceased + disputed
  //              keeps the memorial contract: no bar (the inline tip form
  //              below remains reachable).
  //   lost     → finder form (owner-allowed) else sighting form; secondary
  //              "Llamar" only when the phone is disclosed AND no custody
  //              dispute is open (D2).
  //   active   → tier2 visible: scroll to the medical summary (low urgency);
  //              tier 0: NO bar (PO 2026-07-24 — a sticky found-report on a
  //              pet nobody is looking for invites false reports and dilutes
  //              genuinely-lost urgency; the "¿Encontraste a esta mascota?"
  //              form stays reachable inline lower on the page).
  //   deceased → no bar (memorial — there is no useful street action).
  const actionBar: CredentialActionBarProps | null = pet.inCustodyDispute
    ? pet.status === "deceased"
      ? null
      : { mode: "dispute" }
    : isLost
      ? {
          mode: "lost",
          primaryHref: pet.allowFinderFormWhenLost
            ? `/p/${publicToken}/encontre`
            : `/p/${publicToken}/sighting`,
          primaryLabel: pet.allowFinderFormWhenLost
            ? foundPossessivePhrase(pet.sex)
            : sightingPhrase(pet.sex),
          phoneHref:
            pet.disclosePhoneWhenLost && lostContext?.phone
              ? `tel:${normalizePhoneForTel(lostContext.phone) ?? lostContext.phone}`
              : null,
        }
      : pet.status === "active" && tier2Active
        ? { mode: "medical" }
        : null;

  return (
    // Landing shell (AppShell variant=landing) owns #main-content + min-height.
    <div className="min-h-screen bg-ln-paper font-ln-sans">
      {/* Passive scan floor only — no on-load location prompt (PO 2026-07-24,
          Option A: precise finder GPS is captured intent-driven inside the
          sighting flow, not "antes de tiempo" on scan). */}
      <ScanLogger publicToken={publicToken} />

      {/* Guilloché band — LN security stripe */}
      <div
        aria-hidden="true"
        className="h-[4px] flex-shrink-0 opacity-90"
        style={{
          background:
            "repeating-linear-gradient(90deg,var(--color-ln-azul) 0 2px,transparent 2px 4px),var(--color-ln-celeste)",
        }}
      />

      {/* When the sticky bar renders, mobile bottom padding grows so the last
          content (credential footer) is never hidden behind the fixed bar. */}
      <div className={`mx-auto max-w-[460px] px-4 py-6 ${actionBar ? "pb-28 sm:pb-14" : "pb-14"}`}>
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
              <p className="m-0 font-ln-serif text-md font-semibold text-ln-ink">Alerta médica</p>
              <p className="mt-0.5 text-sm leading-[1.45] text-ln-ink-2">
                Esta mascota requiere atención médica. Contactá al dueño escaneando el QR.
              </p>
            </div>
          </div>
        )}

        {/* DC13: Official custody disclaimer — the masthead situation chip
            below is the single authority for announcing the custody STATE
            (pet-state single authority standard, PO decision 2026-07-16,
            mirrored here from the owner profile fix). This box only adds
            what the chip can't: who's in charge and what a finder should do. */}
        {isUnderOfficialCustody && (
          <div
            role="alert"
            data-section="custody-disclaimer"
            className="mb-4 rounded-[var(--radius-sm)] border border-ln-warn-100 border-l-[3px] border-l-ln-warn bg-ln-warn-050 px-4 py-3"
          >
            <p className="mb-1 font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-ln-warn">
              Custodia oficial
            </p>
            {openCustodyEpisode?.authorityName && (
              <p className="m-0 text-sm text-ln-ink-2">
                Autoridad a cargo: {openCustodyEpisode.authorityName}
              </p>
            )}
            <p className="mt-1 text-sm text-ln-mute">
              Comunicate con la autoridad sanitaria competente para más información.
            </p>
          </div>
        )}

        {/* D2: custody dispute — neutral banner, no accusation, no dispute
            details. Distinct from the DC13 official-custody box above (that
            one is a sanitary_authority seizure; this is pets.inCustodyDispute,
            set by custody_dispute_raised / cleared by custody_dispute_resolved
            — see custody-disputes module). Reuses the same box structure. */}
        {pet.inCustodyDispute && (
          <div
            role="alert"
            data-section="custody-dispute-disclaimer"
            className="mb-4 rounded-[var(--radius-sm)] border border-ln-warn-100 border-l-[3px] border-l-ln-warn bg-ln-warn-050 px-4 py-3"
          >
            <p className="mb-1 font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-ln-warn">
              Titularidad en revisión
            </p>
            <p className="m-0 text-sm text-ln-ink-2">Titularidad en revisión por la autoridad.</p>
            <p className="mt-1 text-sm text-ln-mute">
              Estamos revisando la situación de esta mascota junto a la autoridad competente.
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
              className="grid h-[26px] w-[26px] flex-shrink-0 place-items-center rounded-full border-[1.5px] border-ln-azul bg-ln-celeste-050 font-ln-serif text-sm font-semibold text-ln-azul"
            >
              m
            </div>
            {/* `basis-[7rem]` is what makes the row WRAP instead of crushing.
                Measured at exactly 390px: this block was flex-1 min-w-0 against
                two chips that cannot shrink (a flex item defaults to
                min-width:auto, so their intrinsic text width is a floor). It
                therefore absorbed the whole deficit and collapsed — clientWidth
                2px against a scrollWidth of 58px, i.e. "Credencial pública"
                rendered into a 2-pixel-wide box. Giving it a basis floor makes
                the flex-wrap already on .pc-head do its job: the chips drop to a
                second line. `truncate` is the last-resort guard below it. */}
            {/* RA-10 (b): the label was an 8 px literal — the smallest type on
                the flagship public surface, two steps under the `--text-xs`
                (10px) floor the type scale declares for micro labels. It is now
                the token.
                THE BASIS MOVED WITH IT, and it had to. Measured on the running
                build at 390px: at 10px the tracked uppercase run is 133px wide
                inside a 123px box, so the `truncate` below would have clipped it
                to "CREDENCIAL PÚBLIC…" — trading an unreadable label for a
                mutilated one on the credential's own identity band. `8rem`
                (128px) is the first basis that exceeds what fits beside the
                nowrap tier chip, which is exactly the mechanism the note above
                describes: the chip drops to a second line and the block takes
                the full width. Costs ~30px of masthead height at 390px; at
                desktop widths the row has room and nothing wraps. */}
            <div className="min-w-0 flex-1 basis-[8rem]">
              <span className="font-ln-serif text-md font-semibold text-ln-ink">miMAR</span>
              <span className="block truncate font-ln-mono text-xs uppercase tracking-[.14em] text-ln-mute">
                Credencial pública
              </span>
            </div>
            {/* Tier chip — nowrap so it never breaks "NIVEL 2 · DATOS MÉDICOS"
                mid-label; it wraps as a whole unit or not at all. */}
            <span
              className={`whitespace-nowrap rounded-full border px-2 py-[3px] font-ln-mono text-xs font-semibold tracking-[.08em] ${tier2Active ? "border-ln-ok-100 bg-ln-ok-050 text-ln-ok" : "border-ln-celeste-100 bg-ln-celeste-050 text-ln-azul"}`}
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
          <CredentialPhoto src={photoUrl ?? null} petName={pet.name} />
          {/* CredentialPhoto also owns the no-photo placeholder, so a URL that
              404s at request time degrades to the same initial-letter card
              instead of a broken-image glyph. */}

          {/* Name bar */}
          <div className="px-4 pt-[15px] pb-3">
            {/* h1: this is the most-scanned public page in the product (QR landing) —
                it must expose a page-level heading (WCAG 1.3.1 / 2.4.6). */}
            {/* The status DOT that used to sit here is gone (UI review, PO
                2026-08-06). It was an unlabeled colour with no legend on the
                most-scanned public page in the product: a finder had no way to
                learn what green vs amber vs red meant, and every state it could
                express was already spelled out in words one line above (the
                masthead situation chip, which carries icon + label + recency
                and role="alert" for perdida) and again in the identity grid
                below. Removing it costs no information and one fewer thing to
                decode. It was `aria-hidden` decorative, so no accessible name
                was lost — the chip already owns the state for screen readers. */}
            <h1 className="font-ln-serif text-3xl font-semibold leading-none tracking-[-0.02em] text-ln-ink">
              {pet.name}
            </h1>
            <p className="mt-[5px] text-md text-ln-ink-2">
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
              // cursor UX D2: titularidad en revisión — never disclose the
              // contested owner's name/phone/email while a custody dispute is
              // open. Red-team hardening 2026-07: the reporting CTAs
              // (finderFormHref / sightingFormHref) now ALSO go null — both
              // flows relay the finder's contact to the contested owner
              // (notification and/or owner-visible timeline payload), which
              // takes sides in a legal dispute. custodyDisputed renders the
              // neutral authority notice in their place.
              custodyDisputed={pet.inCustodyDispute}
              ownerFirstName={
                pet.discloseFirstNameWhenLost && !pet.inCustodyDispute
                  ? lostContext.ownerFirstName
                  : null
              }
              ownerPhoneE164={
                pet.disclosePhoneWhenLost && !pet.inCustodyDispute ? lostContext.phone : null
              }
              ownerEmail={
                pet.discloseEmailWhenLost && !pet.inCustodyDispute ? lostContext.email : null
              }
              lastSeenPlaceName={pet.discloseLastLocationWhenLost ? lostContext.locationText : null}
              lastSeenLocality={
                pet.discloseLastLocationWhenLost ? (pet.jurisdictionLocality ?? null) : null
              }
              lastSeenCoords={pet.discloseLastLocationWhenLost ? lostContext.lastSeenCoords : null}
              lastSeenAt={pet.discloseLastLocationWhenLost ? lostContext.lastSeenAt : null}
              distinguishingFeatures={pet.distinguishingFeatures}
              finderFormHref={
                pet.allowFinderFormWhenLost && !pet.inCustodyDispute
                  ? `/p/${publicToken}/encontre`
                  : null
              }
              sightingFormHref={pet.inCustodyDispute ? null : `/p/${publicToken}/sighting`}
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

          {/* Tier 2 — enabled notice + streamed medical summary (#16a), wrapped
              with the sticky bar's "Ver resumen médico" scroll target. The
              wrapper is style-neutral (the seam divs inside are unchanged);
              scroll-mt clears the sticky emergency banner when present. */}
          {tier2Active && (
            <div id={MEDICAL_SECTION_ID} className="scroll-mt-24">
              <div className="flex items-center gap-[7px] border-t border-ln-celeste-100 bg-ln-celeste-050 px-4 py-2.5 font-ln-mono text-xs leading-[1.5] tracking-[.02em] text-ln-azul-700">
                <Icon name="unlock" size="sm" decorative />
                {pet.tier2PublicPermanent
                  ? "El dueño habilitó la libreta médica de forma permanente"
                  : tier2EnabledUntil
                    ? `El dueño habilitó la libreta médica hasta el ${tier2EnabledUntil.toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: AR_TIME_ZONE })}`
                    : null}
              </div>

              {/* The shell (photo, name, identity) paints first; this heavy
                  vaccination projection streams in behind a skeleton that
                  reserves its height so the sections below do not jump.
                  degraded-states: the fallback escalates to waiting text /
                  degraded card if the stream stalls (pure CSS). The OriginOrg
                  fallback={null} boundary below stays UNWRAPPED on purpose —
                  the badge is absent for most pets, so any fallback UI there
                  would flash then vanish. */}
              <Suspense
                fallback={
                  <DegradedFallback>
                    <CredentialTier2MedicalSkeleton />
                  </DegradedFallback>
                }
              >
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
            </div>
          )}

          {/* Identity section */}
          <div className="border-t border-ln-line-2 px-4 py-[13px]">
            <p className="mb-[9px] font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-ln-mute">
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
                <p className="m-0 font-ln-mono text-xs uppercase tracking-[.06em] text-ln-faint">
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
              <span className="font-ln-mono text-xs font-semibold uppercase tracking-[.08em] text-ln-mute">
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

          {/* "Found this pet?" action area. Disputed pets (D2 hardening,
              red-team 2026-07) never get the owner-contact-relay form: while
              titularidad is under review the system must not relay a finder's
              name/contact to the contested owner. PO 2026-07-24: instead of a
              dead-end notice, they get the neutral dispute-tip form — the
              submission lands on the dispute case for the reviewing authority
              only (see DisputeTipForm / report-dispute-tip.ts). */}
          {pet.inCustodyDispute ? (
            <div
              data-section="found-form-disputed"
              className="border-t border-ln-line bg-ln-stripe px-4 py-3.5"
            >
              {/* id: the sticky bar's "dispute" action opens + scrolls here;
                  scroll-mt clears the sticky emergency banner when present. */}
              <details id={DISPUTE_SECTION_ID} className="group scroll-mt-24">
                <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3">
                  <div>
                    <p className="m-0 font-ln-serif text-md font-semibold text-ln-ink">
                      ¿Tenés información sobre esta mascota?
                    </p>
                    <p className="mt-0.5 text-sm text-ln-mute">{DISPUTE_TIP_INTRO}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="flex-shrink-0 text-lg text-ln-mute transition-transform group-open:rotate-90"
                  >
                    ›
                  </span>
                </summary>
                <div className="mt-3 border-t border-ln-line pt-3.5">
                  <DisputeTipForm publicToken={publicToken} />
                </div>
              </details>
            </div>
          ) : (
            <div className="border-t border-ln-line bg-ln-stripe px-4 py-3.5">
              {/* id: the sticky bar's tier-0 "report" action opens + scrolls to
                this existing form (no new flow); scroll-mt clears the sticky
                emergency banner when present. */}
              <details id={REPORT_SECTION_ID} className="group scroll-mt-24">
                <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3">
                  <div>
                    <p className="m-0 font-ln-serif text-md font-semibold text-ln-ink">
                      ¿Encontraste a esta mascota?
                    </p>
                    <p className="mt-0.5 text-sm text-ln-mute">Tocá acá para avisarle al dueño.</p>
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
          )}

          {/* Credential footer */}
          <div className="px-4 py-3 text-center font-ln-mono text-xs leading-[1.7] tracking-[.02em] text-ln-faint">
            CREDENCIAL PÚBLICA · miMAR · Registro Nacional de Mascotas
            <br />
            {pet.publicToken.toUpperCase()} · República Argentina
          </div>
        </div>
        {/* END CREDENTIAL CARD */}
      </div>

      {/* Sticky primary CTA — mobile only (<sm); desktop keeps the inline
          actions. All props pre-gated above (disclosure + D2 dispute). */}
      {actionBar && <CredentialActionBar {...actionBar} />}
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
    /** Raw "lat, lng" decimal degrees — the demoted line under the map (M3). */
    lastSeenCoords: string | null;
    /** When the DISPLAYED last-seen point was reported (owner update, else the
     *  mark-lost event). Drives the "hace N días" recency the section leads with
     *  — distinct from `lostSince`, which is when the search opened. */
    lastSeenAt: Date | null;
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

    // Overlay parity with fetchLostEpisodeForPet (fresh-review F1, QA
    // 2026-08-03): "actualizar última ubicación" appends an owner-authored
    // note_added(kind='sighting') event — append-only spine — so the CURRENT
    // last-seen location may live there, not on the status_changed origin.
    // Without this, the public credential a finder scans showed the origin
    // address while the owner profile, poster and sighting map showed the
    // update. Same ATOMIC semantics (place + coords + never mixed across
    // events) and same S4 defense-in-depth: location key/columns projected
    // as SQL NULL when not disclosed. Scoped to the current episode by
    // occurredAt >= the latest mark-lost event (owner updates of a previous
    // episode necessarily predate it). authorRole='owner' keeps unvetted
    // finder sightings out of the headline.
    let ownerUpdate:
      | {
          locationText: string | null;
          // numeric columns come back as string from Drizzle; readPoint
          // normalizes (same shape as latestLostEvent above).
          locationLat: string | number | null;
          locationLng: string | number | null;
          occurredAt: Date;
        }
      | undefined;
    if (latestLostEvent) {
      [ownerUpdate] = await db
        .select({
          locationText: showLocation
            ? sql<string | null>`nullif(trim(${petEvents.payload}->>'location_description'), '')`
            : sql<string | null>`null`,
          locationLat: showLocation ? petEvents.locationLat : sql<number | null>`null`,
          locationLng: showLocation ? petEvents.locationLng : sql<number | null>`null`,
          occurredAt: petEvents.occurredAt,
        })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, pet.id),
            eq(petEvents.eventType, "note_added"),
            eq(petEvents.authorRole, "owner"),
            gte(petEvents.occurredAt, latestLostEvent.occurredAt),
            sql`${petEvents.payload}->>'kind' = 'sighting'`,
            sql`(${petEvents.payload}->>'location_description' IS NOT NULL OR ${petEvents.locationLat} IS NOT NULL)`,
          ),
        )
        .orderBy(desc(petEvents.occurredAt))
        .limit(1);
    }

    const lastSeenSource = ownerUpdate ?? latestLostEvent;
    const textLocation =
      typeof lastSeenSource?.locationText === "string" && lastSeenSource.locationText.length > 0
        ? lastSeenSource.locationText
        : null;
    // Precise lat/lng captured on the event row itself (null unless disclosed).
    const eventPoint = lastSeenSource ? readPoint(lastSeenSource) : null;
    // Raw decimal degrees, for the DEMOTED coordinate line only (UI review M3,
    // PO 2026-08-06). These used to be substituted INTO `locationText` when the
    // event carried no address, so the "Última vez vista" heading led with
    // "-54.806060, -68.304976 · Ushuaia" — six decimal places (≈11 cm) of
    // machine precision as the first thing a worried neighbour reads, with the
    // one word they could act on pushed to the end. The place name and the
    // recency lead now; the numbers ride under the map for the finder who
    // actually wants to type them into a GPS.
    const geoLocation = eventPoint
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
      locationText: textLocation,
      lastSeenCoords: geoLocation,
      lastSeenAt: lastSeenSource?.occurredAt ?? null,
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
    <div className="flex min-h-screen items-center justify-center bg-ln-paper font-ln-sans">
      <div className="mx-auto max-w-[400px] px-6 py-12 text-center text-ln-ink">
        {/* Real h1 (not just a styled <p>) — a screen-reader user throttled
            before any pet data loads still needs page orientation. No pet
            name is known at this point, so a generic heading is honest. */}
        <h1 className="mb-3 font-ln-serif text-lg font-semibold">Demasiadas consultas</h1>
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
//
// Typography roles (UI review M2 consolidation): the label is the document's
// mono micro-label step (text-xs / 10px, the floor the type scale declares) and
// the value is the body step (text-md / 14px). The `mono` variant steps the
// VALUE down one step to text-sm: it renders the LIB-AR-XXXXXXXX token, whose
// fixed-advance glyphs are materially wider than the sans face at the same
// nominal size, and the grid cell is half of a two-column layout at 390px.
// That is an optical fit for one variant of the value role, not a second role.
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
      <p className="m-0 font-ln-mono text-xs uppercase tracking-[.06em] text-ln-faint">{label}</p>
      <p
        className={`mt-px break-words font-medium text-ln-ink ${
          mono ? "font-ln-mono text-sm" : "font-ln-sans text-md"
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
      <p className="mb-1.5 font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-ln-azul">
        Perro de Asistencia
      </p>
      <p className="mb-1.5 font-ln-serif text-md font-semibold leading-[1.45] text-ln-ink">
        Esta persona tiene derecho a ingresar, deambular y permanecer con su perro en este
        establecimiento, espacio privado de acceso público y transporte público.
      </p>
      <p className="text-sm text-ln-ink-2">
        Marco legal: <strong className="text-ln-ink">Arts. 1 y 7, Ley 26.858</strong> · Reg. Decreto
        792/2019 · Credencial RUPGA vigente (Res. ANDIS 2588/2022).
      </p>
      {rabiesAtRisk && (
        <p className="mt-2.5 border-t border-ln-celeste-100 pt-2.5 text-sm text-ln-warn">
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
      <p className="mb-1 font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-ln-warn">
        Observación antirrábica
      </p>
      <p className="m-0 text-md font-semibold text-ln-ink">
        Esta mascota está en observación antirrábica activa (período de 10 días).
      </p>
      <p className="mt-1 text-sm text-ln-mute">
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
      <p className="mb-2 font-ln-mono text-xs font-semibold uppercase tracking-[.1em] text-ln-azul">
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
