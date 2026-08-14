// ---------------------------------------------------------------------------
// PET PROFILE — "two-face" redesign (Credencial | Libreta), 2026-07-01
// Spec: docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md
// AGENTS.md "Design rules" #5 documents the shipped block order.
//
// This RSC is now a thin data-fetch + assembly shell. The two faces
// themselves (and everything they render) live in dedicated components:
//   - CredentialFace (Face 1, server, eager)      — components/pet-profile/CredentialFace.tsx
//   - LibretaFace     (Face 2, server-rendered, streamed via its own
//     <Suspense> — see LibretaFaceSection/PF3 below) — components/pet-profile/LibretaFace.tsx
//   - PetDetailTabsPanel — owns the tab switcher only; both faces arrive as
//     already-rendered nodes (credencialContent/libretaContent props).
//
// Screen order (normal/active state, AGENTS.md rule 5):
//   back-link → org notice (org-path only) → PetDetailTabsPanel, whose
//   `credencialContent` (Face 1, eager) is: CredentialFace (symmetric identity:
//   photo · centered name · public QR both flanking the band — 3b/A; compliance
//   as an inline grid on desktop / a tap-to-expand disclosure on mobile — 3b/B;
//   compact ppp/service-dog rows) → <PetAlertStrip> (avisos, urgency-ordered,
//   LostCaseBlock leads it when the pet is lost) → the labeled action row
//   [Anotar][Compartir][Editar][Perdida][Más]. Capture (3b/C) no longer sits
//   inline as a mid-face textarea: it moved to the fixed "Asentar" bar
//   (CitizenTabBar, mobile — task #9) plus the pet-specific "Anotar" action-row
//   link (?sheet=anotar for THIS pet, every breakpoint).
//   The Libreta face (deferred) is ONE consolidated timeline, no lens chips
//   (ADR-10) — see LibretaFace.
//
// resolvePetFace (lib/domain/pet-face-nav.ts) is the single pure mapper for
// every legacy `?tab=` deep link (resumen/vacunas/historial/libreta) onto
// {face, lens}; the H1 compliance wiring at deriveComplianceState below is
// unchanged by the redesign.
//
// pet-document-redesign (2026-07-02, S2): the pet.status === 'lost' early
// return (LostCockpit, full-screen) was DELETED. The normal profile now
// ALWAYS renders — lost surfaces as <LostCaseBlock> at the top of
// PetAlertStrip, so Credencial/Libreta/action row/Anotar sheet stay usable
// while the pet is lost (spec REQ-5.1/REQ-5.2). The D9 `?fromLost=1` bypass
// is gone too (REQ-6.3 no-op redirect, see the top of this function).
//
// pet-document-redesign (2026-07-02, ADR-15): the pet.status === 'deceased'
// early return (<DeceasedView>, <LnMemorialTimeline>) was DELETED too. A
// deceased pet now renders the SAME document with an In-Memoriam skin —
// see `memorial` / CredentialFace's `memorial` prop and the pruned
// [Compartir][Más] action bar below.
//
// Preserved verbatim:
//   - <PetOpenCasesSection>, <PregnancyInProgressCard> — inside PetAlertStrip.
//   - <RabiesObservationBanner>, <TransitBanner> — page-local, inside PetAlertStrip.
//
// PPP/service-dog attestation state is read from `typedEvents`
// (PROFILE_V2_TYPED_EVENT_TYPES), which now includes `dangerous_breed_attested`
// (pet-document-redesign REQ-10.1) — both the compliance stamp (derivePpp)
// and the `ppp.attested` prop below read the same fixed whitelist.
// ---------------------------------------------------------------------------

import { isTransitRole } from "@/components/PetCard.helpers";
import { PetOpenCasesSection } from "@/components/PetOpenCasesSection";
import { PregnancyInProgressCard } from "@/components/PregnancyInProgressCard";
import { CredentialFace } from "@/components/pet-profile/CredentialFace";
import {
  LibretaFace,
  type LibretaFaceEmergencyContacts,
} from "@/components/pet-profile/LibretaFace";
import { LostCaseBlock } from "@/components/pet-profile/LostCaseBlock";
import { PetActionRow } from "@/components/pet-profile/PetActionRow";
import { type PetAlert, PetAlertStrip } from "@/components/pet-profile/PetAlertStrip";
import { PetCredentialCarousel } from "@/components/pet-profile/PetCredentialCarousel";
import {
  PetDetailTabsPanel,
  TabErrorState,
  TabLoadingSkeleton,
} from "@/components/pet-profile/PetDetailTabsPanel";
import {
  type AvatarSwitcherPet,
  PetSwitcherAvatars,
} from "@/components/pet-profile/PetSwitcherAvatars";
import { DegradedFallback } from "@/components/ui/DegradedFallback";
import { AnalyticsLoadFallback } from "@/components/ui/dashboard/AnalyticsLoadFallback";
import {
  appointments,
  attachments,
  cases,
  db,
  organizations,
  ownerships,
  petServiceDog,
  pets,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { loadWithTimeout } from "@/lib/analytics/analytics-load";
import {
  fetchActiveRemindersForPet,
  fetchComplianceStatesForPets,
  fetchLivePetsForCarouselRanking,
  fetchPetEventsForProfileV2,
} from "@/lib/analytics/owner-dashboard";
import { resolveEmergencyContacts } from "@/lib/domain/emergency-contacts";
import { computeMedicationsActive } from "@/lib/domain/libreta-health-status";
import {
  type CarouselPet,
  rankOwnerCarousel,
  shouldShowCarousel,
} from "@/lib/domain/owner-carousel";
import { buildFromLostRedirectTarget, resolvePetFace } from "@/lib/domain/pet-face-nav";
import { isPetAdoptedByUser } from "@/lib/infra/adoption-checkin";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { GENERIC_CASE_LIST_EXCLUDED_KINDS } from "@/lib/infra/case-queries";
import { fetchLostEpisodeForPet, fetchLostScanEvents } from "@/lib/infra/lost-mode";
import { petAlertsOriginShelter } from "@/lib/infra/origin-shelter-alert";
import {
  type PetAccessSuccess,
  getFormerOwnerReadAccess,
  requirePetAccess,
} from "@/lib/infra/pet-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { resolvePhysicalCredentialChannels } from "@/lib/infra/physical-credential-channels";
import { getPhysicalTagInterest } from "@/lib/infra/physical-tag-interest";
import { SERVICE_TYPE_LABELS, buildPresentarHref } from "@/lib/infra/service-dog-labels";
import { credentialQrUrl } from "@/lib/infra/site-url";
import { eventAttachmentSignedUrl, petPhotoUrl } from "@/lib/infra/storage";
import {
  deriveFirstStepsChecklist,
  hasReviewedDisclosurePrefs,
} from "@/lib/projections/first-steps-checklist";
import {
  deriveComplianceState,
  lnPetStatusFromCompliance,
  microchipHeroTag,
} from "@/lib/projections/pet-compliance";
import { PET_SITUATIONS, derivePetSituation } from "@/lib/ui/pet-situation";
import {
  ageFromDateOfBirth,
  formatDateShort,
  sexLabel,
  situationLabelForSex,
  speciesLabel,
} from "@/lib/utils/format";
import { getLibretaFaceData } from "@/src/modules/pets/application/tab-data/get-libreta-face-data";
import { fetchPendingReturnProposalForOwner } from "@/src/modules/return-to-owner/application/proposal-queries";
import { and, asc, desc, eq, gt, inArray, isNull, notInArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { SheetMounter } from "./SheetMounter";
import { CloseRabiesObservationButton } from "./_components/CloseRabiesObservationButton";
import { ConvertFosterButton } from "./_components/ConvertFosterButton";
import { resolveCaptureIntentUrl } from "./anotar/handoff";

// ---------------------------------------------------------------------------
// Pet-state standardization (PO 2026-07-16): the masthead band (chromeSituation
// below) is the single state authority on this page. The old page-local
// derivePetState/derivePetStateLabel helpers (a third, unused state mapping)
// were removed — derivePetSituation (lib/ui/pet-situation.ts) is the one
// derivation every surface reads. (The transitional "Ciclos abiertos" dedup
// filter died with the under-card PetOwnerActivity block — tarjeta-todo.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Libreta face (Face 2) — server-rendered (perf audit 2026-07-19, PF3)
// ---------------------------------------------------------------------------
//
// Wrapped in its own <Suspense> below (see `documentNode`) so it streams
// independently of the eager, SSR'd Face 1 (CredentialFace never waits on
// this). Calls the tab-data use-case DIRECTLY with the access this page
// already resolved via requirePetAccess — no re-auth, and no client-trusted
// token crosses the wire. This replaces the old client mount-effect in
// PetDetailTabsPanel that called the `getLibretaFaceData` SERVER ACTION on
// every profile load: that action re-ran requirePetAccess's full auth +
// pet-access chain (a second getUser() + ownership query) for data the page
// had already authorized in the SAME request — wasted backend work on every
// view, not critical-path latency (the credential card paints without
// waiting for this).
async function LibretaFaceSection({
  user,
  pet,
  accessPath,
  organization,
  isOwner,
  emergencyContacts,
}: {
  user: PetAccessSuccess["user"];
  pet: PetAccessSuccess["pet"];
  accessPath: PetAccessSuccess["accessPath"];
  organization: PetAccessSuccess["organization"];
  isOwner: boolean;
  emergencyContacts: LibretaFaceEmergencyContacts | null;
}) {
  const result = await getLibretaFaceData({ user, pet, accessPath, organization });
  if (!result.ok) return <TabErrorState message={result.error} />;
  return (
    <div className="op-fade-in">
      <LibretaFace
        data={result.data}
        petPublicToken={pet.publicToken}
        isOwner={isOwner}
        emergencyContacts={emergencyContacts}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicToken: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { publicToken } = await params;
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const lenteParam = typeof sp.lente === "string" ? sp.lente : undefined;

  // REQ-6.3 (pet-document-redesign): the D9 `?fromLost=1` bypass has no
  // target anymore — LostCockpit is gone and the normal profile always
  // renders for lost pets (REQ-5.1). Redirect to the plain profile URL
  // (fromLost stripped, every other param preserved) so old deep links /
  // bookmarks don't retain a dead param or error.
  const fromLostRedirectTarget = buildFromLostRedirectTarget(publicToken, sp);
  if (fromLostRedirectTarget) {
    redirect(fromLostRedirectTarget);
  }

  // Auth chain (external audit 2026-07): an expired/absent session must NOT
  // render a 404 — it must bounce to /login carrying returnTo so the visitor
  // lands back on this pet after signing in. requirePetAccess exposes a
  // structural `reason` so we branch WITHOUT string-matching the error message:
  //   - "no-session"            → redirect to login (returnTo = this pet's path)
  //   - "not-found-or-forbidden" → notFound() (unchanged — no information leak;
  //       covers no-such-pet, out-of-scope, and erased accounts alike)
  // NOTE on the split-brain race (documented): middleware swallows a stale
  // refresh-token AuthApiError and continues, and the (app) layout's
  // requireUserOrRedirect runs a SECOND concurrent getUser() that can race this
  // page's getUser() and rotate the refresh token — the loser gets null. That
  // race is supabase-ssr behavior and is NOT fixed here; this branch only makes
  // its worst case a login-with-returnTo instead of a bare 404.
  const access = await requirePetAccess(publicToken);
  if (!access.ok) {
    if (access.reason === "no-session") {
      redirect(`/iniciar-sesion?returnTo=${encodeURIComponent(`/mis-mascotas/${publicToken}`)}`);
    }
    // Former-owner READ-ONLY fallback (PO decision 2026-07-18): a session
    // that resolved but has no write-side access might still be the
    // IMMEDIATE former owner of a pet currently under an open custody
    // episode (decomiso) — "el ex-dueño conserva lectura durante el
    // proceso." That grant is read-only and lives entirely outside
    // requirePetAccess's write boundary; see getFormerOwnerReadAccess in
    // lib/infra/pet-access.ts for the derivation and why it can never leak
    // write capability (no write-side call site reaches it).
    if (access.user) {
      const formerOwnerAccess = await getFormerOwnerReadAccess(publicToken, access.user.id);
      if (formerOwnerAccess.ok) {
        return (
          <FormerOwnerCustodyReadOnlyView
            pet={formerOwnerAccess.pet}
            casePublicCode={formerOwnerAccess.custodyCase.publicCode}
          />
        );
      }
    }
    notFound();
  }
  const { user, pet, accessPath, organization } = access;

  const isOwner = accessPath === "owner";

  // No-flash capture routing (code review 2026-07-03): when a deep link /
  // notification or home deeplink lands on `?sheet=anotar` carrying a
  // resolvable intent (a known `kind`, or free text the deterministic matcher
  // recognizes), resolve it HERE and redirect server-side — before any render.
  // The old client-side ResolvedCaptureRedirect wasted a full profile render
  // and used router.replace on the cross-route hop, inheriting the Next 15.5
  // silent-drop defect that lib/ui/sheet-nav.ts exists to route around. Only
  // owners capture (REQ-4.4) and never for a deceased pet (REQ-9.3); an
  // unresolvable `?sheet=anotar` falls through to SheetMounter's sheet.
  if (sp.sheet === "anotar" && isOwner && pet.status !== "deceased") {
    const captureText = typeof sp.text === "string" ? sp.text : undefined;
    // QA A9 viewer gate for the free-text branch: the matcher can resolve
    // "check-in" to post_adoption_checkin, whose page 404s for anyone but the
    // registered adopter. One indexed read, only on this rare deep-link shape,
    // so the server-side no-flash redirect can't send a non-adopter into the
    // 404 (adversarial review 2026-08-14). The batched read further down
    // feeds the sheet catalog; this one has to exist BEFORE the redirect.
    const checkinAllowed = captureText?.trim() ? await isPetAdoptedByUser(pet.id, user.id) : false;
    const captureTarget = resolveCaptureIntentUrl(
      publicToken,
      {
        kind: typeof sp.kind === "string" ? sp.kind : undefined,
        text: captureText,
      },
      { showCheckinOption: checkinAllowed },
    );
    if (captureTarget) redirect(captureTarget);
  }

  // Two-face redesign (2026-07-01): resolvePetFace is the single pure mapper
  // for every legacy ?tab= deep link (see lib/domain/pet-face-nav.ts). Org
  // viewers get the same clamp behavior as before, now expressed as a lens
  // clamp (Libreta is reachable, `todo` is not) instead of hiding the face.
  const { face: activeFace } = resolvePetFace({
    tab: tabParam,
    lente: lenteParam,
    isOwner,
  });

  // Stage 1: photo + ownership role + service-dog + cases (all independent).
  // Photo query runs once; both photoUrl and editPhotoUrl are derived from it.
  // allCases: full row select (Case[] required by AchievementInput), capped at 50.
  const [[photoRow], [ownerRow], [serviceDogRow], allCases, openCustodyEpisodeRows] =
    await Promise.all([
      pet.primaryPhotoId
        ? db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
        : (Promise.resolve([]) as Promise<(typeof attachments.$inferSelect)[]>),
      accessPath === "owner"
        ? db
            .select({ role: ownerships.role })
            .from(ownerships)
            .where(
              and(
                eq(ownerships.petId, pet.id),
                eq(ownerships.ownerUserId, user.id),
                isNull(ownerships.endedAt),
              ),
            )
            .limit(1)
        : (Promise.resolve([]) as Promise<{ role: string }[]>),
      db.select().from(petServiceDog).where(eq(petServiceDog.petId, pet.id)).limit(1),
      // Capped at 50, most recent first — the cap needs a deterministic order or
      // a pet with >50 cases would silently lose an arbitrary subset.
      // Excludes HIDDEN_FROM_SUBJECT_CASE_KINDS (welfare_denuncia) and
      // lost_pet_episode — same predicate as findOpenCasesForPetWithCodes, so
      // the alert-strip trigger below (`allCases.some(open)`) never fires on a
      // case the owner isn't supposed to see, and lost stays single-rendering-
      // path (LostCaseBlock owns it) — pet-document-redesign REQ-1.1/1.4.
      db
        .select()
        .from(cases)
        .where(
          and(
            eq(cases.primaryPetId, pet.id),
            notInArray(cases.caseKind, [...GENERIC_CASE_LIST_EXCLUDED_KINDS]),
          ),
        )
        .orderBy(desc(cases.openedAt))
        .limit(50),
      // Open custody_episode opened by a sanitary_authority org — the SAME
      // canonical discriminator /p uses (DC13): caseKind + opener orgType, never
      // parsed from notes. Feeds the custodia-oficial situation (pet-state-header
      // R2.6); allCases above lacks the opener-org join, so this stays its own
      // bounded query.
      db
        .select({ caseId: cases.id })
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
    ]);

  // Both photoUrl and editPhotoUrl come from the same single row.
  const photoUrl = petPhotoUrl(photoRow?.storagePath);
  const editPhotoUrl = photoUrl;

  // isTransit = true for users with an active foster row (org-linked
  // placement) OR an active shelter_custody row (vecino-helps-stray, no org
  // involved — AGENTS.md; also what the alta's CustodyKindToggle writes for
  // "la estoy cuidando"). Single source of truth: isTransitRole.
  let isTransit = false;
  let ownershipRole: string | null = null;
  if (accessPath === "owner") {
    isTransit = isTransitRole(ownerRow?.role ?? "");
    ownershipRole = ownerRow?.role ?? null;
  }

  // Deceased (pet-document-redesign ADR-15): NO early return anymore — the
  // pet always renders the SAME document with an In-Memoriam skin (see
  // `memorial` below, threaded into CredentialFace). The old heavy O(N)
  // deceasedEvents + attachment-signing query is gone too: the Libreta back
  // (deferred fetch, "todo" lens = no filtering) already returns the pet's
  // full history including death_recorded, subsuming the old parallel
  // LnMemorialTimeline.
  const isDeceased = pet.status === "deceased";

  // Stage 2: queries that depend on ownershipRole or are owner-only.
  // hasPendingReturnProposal depends on ownershipRole (must be "owner").
  let hasPendingReturnProposal = false;
  let viewerContacts: {
    preferredVetName: string | null;
    preferredVetPhone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    displayName: string;
  } | null = null;
  // Chapita (physical-tag-interest) state for the owner — powers the 5th
  // action-bar icon + ?sheet=chapita (pet-document-redesign ADR-17b). Never
  // fetched for a deceased pet (REQ-9.3 suppresses the entry point).
  let chapitaData: { interested: boolean; requestedAt: Date | null } | null = null;
  // Physical credential channel availability for the pet's jurisdiction
  // (admin-rules-console ADR-5/R3.5) — which channels (printable QR, engraved
  // plate, NFC) are configured for this jurisdiction, resolved via the same
  // cascade tiers as other rule types. Rendered inside the chapita sheet.
  let physicalCredentialChannels: Awaited<
    ReturnType<typeof resolvePhysicalCredentialChannels>
  > | null = null;
  // QA A9 — gates the "Check-in post-adopción" entry in the anotar catalog
  // (SheetMounter → CaptureOptionsList). Same predicate the check-in page
  // 404s on; false for org viewers (anotar is owner-only anyway).
  let showCheckinOption = false;

  if (accessPath === "owner") {
    // "Confirmar devolución": only the legal owner, only when a pending return
    // proposal exists. Reuses the same ARCH-B tri-check as /devolucion.
    const returnProposalQuery =
      ownershipRole === "owner"
        ? fetchPendingReturnProposalForOwner(pet.id, user.id, db)
        : Promise.resolve(false);

    // Account-level emergency / vet contacts from the viewer's profile —
    // J-followup columns (migration 0042). displayName feeds Face 1 (titular);
    // the 4 contact fields are the ACCOUNT DEFAULT that the pet-level override
    // falls back to (owner-ia-redesign P2 — see resolveEmergencyContacts below).
    const contactsQuery = db
      .select({
        preferredVetName: profiles.preferredVetName,
        preferredVetPhone: profiles.preferredVetPhone,
        emergencyContactName: profiles.emergencyContactName,
        emergencyContactPhone: profiles.emergencyContactPhone,
        displayName: profiles.displayName,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

    const chapitaQuery = isDeceased
      ? Promise.resolve(null)
      : getPhysicalTagInterest(pet.id, user.id);

    const physicalCredentialChannelsQuery = isDeceased
      ? Promise.resolve(null)
      : resolvePhysicalCredentialChannels({
          country: "AR",
          province: pet.jurisdictionProvince ?? null,
          locality: pet.jurisdictionLocality ?? null,
        });

    // Deceased pets never mount the anotar sheet (REQ-9.3), so skip the read.
    const adoptedQuery = isDeceased ? Promise.resolve(false) : isPetAdoptedByUser(pet.id, user.id);

    const [returnProposalResult, [profileRow], chapitaState, channels, adoptedByViewer] =
      await Promise.all([
        returnProposalQuery,
        contactsQuery,
        chapitaQuery,
        physicalCredentialChannelsQuery,
        adoptedQuery,
      ]);

    hasPendingReturnProposal = returnProposalResult;
    viewerContacts = profileRow ?? null;
    chapitaData = chapitaState;
    physicalCredentialChannels = channels;
    showCheckinOption = adoptedByViewer;
  }

  // Parallel fan-out (perf audit 2026-07-19 qw#3): these reads are independent —
  // they only need `pet` / `user` / `accessPath`, all resolved above — but ran as
  // ~5 SEQUENTIAL awaits, adding ~150-250 ms of serial round-trips to every
  // profile TTFB in prod. One Promise.all collapses them. Only the pregnancy card
  // (derives from typedEvents) and ownerFirstName (pure) stay AFTER the fan-out.
  //   - pppBreedRule / microchipRule: jurisdiction business rules for the edit
  //     sheet + microchip obligation (display-only; submit-time stays authoritative).
  //   - typedEvents: v2 targeted events (replaces the old O(N) events + signing).
  //   - lostData: lost-episode + scans, a self-contained async unit — its internal
  //     episode→scans dependency (scoped so a lost→found→lost pet never pollutes
  //     across episodes) stays sequential INSIDE the unit. Runs for both owner and
  //     org viewers (LostCaseBlock needs it for both roles).
  //   - reminders / canonicalIds / rabies turno: the compliance-projection reads.
  //
  // BOUNDED (2026-08-09, discovery scan). Seven concurrent reads — the widest
  // fan-out outside the dashboards — on the screen an owner opens to check
  // their own animal, and on the screen a vet will open during the pilot. It
  // had no deadline: a degraded pooler left it hanging with nothing logged.
  const profileLoad = await loadWithTimeout(
    Promise.all([
      resolveBusinessRule("ppp_breed_list", {
        province: pet.jurisdictionProvince,
        locality: pet.jurisdictionLocality,
      }),
      resolveBusinessRule("microchip_required", {
        province: pet.jurisdictionProvince,
        locality: pet.jurisdictionLocality,
      }),
      fetchPetEventsForProfileV2(pet.id),
      (async (): Promise<{
        lostEpisode: Awaited<ReturnType<typeof fetchLostEpisodeForPet>>;
        lostScans: Awaited<ReturnType<typeof fetchLostScanEvents>>;
        /** A5 — a found-pet report on this pet also alerts its origin shelter. */
        alertsOriginShelter: boolean;
      }> => {
        // A5 disclosure input — the SAME predicate the notifier runs, so the
        // profile never promises an alert that will not fire (and never stays
        // silent about one that will). Resolved for EVERY pet, not just lost
        // ones: the "Qué se muestra si se pierde" sheet is reachable at any time,
        // and that is precisely when a titular reads it to decide.
        const alertsOriginShelter = await petAlertsOriginShelter(pet.id);
        if (pet.status !== "lost") return { lostEpisode: null, lostScans: [], alertsOriginShelter };
        // Fetch episode first so we can scope the scan feed to the current episode.
        const lostEpisode = await fetchLostEpisodeForPet(pet.id);
        const rawScans = await fetchLostScanEvents(pet.id, undefined, lostEpisode?.id ?? undefined);
        // P0g: sighting/finder items in a private bucket need short-lived signed URLs.
        const lostScans = await Promise.all(
          rawScans.map(async (item) => {
            if ((item.kind === "sighting" || item.kind === "finder") && item.photoStoragePath) {
              const url = await eventAttachmentSignedUrl(item.photoStoragePath);
              return { ...item, photoUrl: url };
            }
            return item;
          }),
        );
        return { lostEpisode, lostScans, alertsOriginShelter };
      })(),
      // Vaccine reminders for owner path only.
      accessPath === "owner"
        ? fetchActiveRemindersForPet(user.id, pet.id)
        : Promise.resolve([] as Awaited<ReturnType<typeof fetchActiveRemindersForPet>>),
      // Canonical chip/tattoo identifiers (ARCH-Q).
      fetchActiveIdentifications(pet.id),
      // WS-2: the pet's next confirmed rabies appointment (service_kind =
      // vaccination_rabies), if any — drives the "Turno reservado" compliance
      // state. Left-joins the provider (org or individual vet) for the label.
      db
        .select({
          slotStartsAt: timeSlots.startsAt,
          orgName: organizations.displayName,
          vetName: profiles.displayName,
        })
        .from(appointments)
        .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
        .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
        .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
        .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
        .where(
          and(
            eq(appointments.petId, pet.id),
            eq(appointments.status, "confirmed"),
            eq(serviceOfferings.serviceKind, "vaccination_rabies"),
            gt(timeSlots.startsAt, new Date()),
          ),
        )
        .orderBy(asc(timeSlots.startsAt))
        .limit(1),
    ]),
  );
  if (!profileLoad.ok) {
    // Degraded profile. `pet` came from requirePetAccess, before any of this
    // ran, so the owner still gets the name they navigated for and a way back
    // — instead of a spinner that never resolves.
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-4">
        <Link href="/mis-mascotas" className="text-sm text-ln-azul hover:underline">
          ← Mis mascotas
        </Link>
        <h1 className="m-0 font-ln-serif text-3xl font-semibold text-ln-ink">{pet.name}</h1>
        <AnalyticsLoadFallback
          reason={profileLoad.reason}
          correlationId={profileLoad.id}
          retryHref={`/mis-mascotas/${pet.publicToken}`}
        />
      </div>
    );
  }
  const [
    pppBreedRule,
    microchipRule,
    { typedEvents },
    lostData,
    petActiveReminders,
    canonicalIds,
    reservedRabiesTurnoRows,
  ] = profileLoad.value;
  const { lostEpisode, lostScans, alertsOriginShelter } = lostData;

  // Derive owner first name from displayName (first word only) — feeds
  // LostCaseBlock's disclosure preview copy for owner viewers only.
  const ownerFirstName = viewerContacts?.displayName
    ? (viewerContacts.displayName.split(" ")[0] ?? viewerContacts.displayName)
    : "el dueño";

  // Pregnancy card data — derived from typedEvents (clinical_info_logged events
  // are in the whitelist so they're available here). MUST stay after the fan-out.
  const PREGNANCY_DURATION_WEEKS_BY_SPECIES: Record<string, number> = {
    dog: 9,
    cat: 9,
    other: 9,
  };
  let pregnancyCardData: {
    startedAt: Date;
    weeksAtDiagnosis: number | null;
    expectedBirthAt: Date;
    lastClinicalAt: Date | null;
  } | null = null;
  if (pet.pregnancyStatus === "in_progress") {
    const startedEvent = typedEvents.find((e) => {
      if (e.eventType !== "clinical_info_logged") return false;
      const p = e.payload as { sub_kind?: string; pregnancy_phase?: string };
      return p.sub_kind === "pregnancy" && p.pregnancy_phase === "started";
    });
    if (startedEvent) {
      const payload = startedEvent.payload as { weeks_at_diagnosis?: number | null };
      const speciesWeeks = PREGNANCY_DURATION_WEEKS_BY_SPECIES[pet.species] ?? 9;
      const remaining = Math.max(speciesWeeks - (payload.weeks_at_diagnosis ?? 0), 0);
      const expectedBirthAt = new Date(
        startedEvent.occurredAt.getTime() + remaining * 7 * 86400000,
      );
      const lastClinical = typedEvents.find(
        (e) => e.eventType === "clinical_info_logged" && e.occurredAt > startedEvent.occurredAt,
      );
      pregnancyCardData = {
        startedAt: startedEvent.occurredAt,
        weeksAtDiagnosis: payload.weeks_at_diagnosis ?? null,
        expectedBirthAt,
        lastClinicalAt: lastClinical?.occurredAt ?? null,
      };
    }
  }

  // tarjeta-todo (PO 2026-07-18): the under-card PetOwnerActivity block
  // (nudges / RemindersSection / Próximos turnos / Ciclos abiertos) was
  // DELETED — the rotating card is the whole profile. Its unique actions
  // moved INTO the card: reminder "Posponer 7 días"/"Registrar" live on the
  // libreta face's PRÓXIMO rows (FutureLedgerList), turnos already render
  // there ("Ver turno"), and open cases keep their one authoritative surface
  // in the Avisos strip (PetOpenCasesSection). The chip_missing nudge CTA
  // duplicated the Cumplimiento card; the scan-activity signal's outside
  // surface dies per PO (the libreta remains the one place scans surface).

  const age = ageFromDateOfBirth(pet.dateOfBirth, pet.deceasedAt);

  // H1 display contradiction fix (clickthrough audit 2026-07-03/04, Segmento
  // 1 #6): the "chip" hero tag used to be pushed here from mere microchip
  // *presence* (canonicalIds.microchip), independently of the compliance
  // card below it — a self-reported chip showed "Microchip verificado" in
  // the hero while the compliance card correctly said "Declarada · sin
  // verificar". The tag is now derived from `complianceState` further down
  // (microchipHeroTag) — the SAME provenance gate — so both surfaces always
  // agree. See that unshift() call below.
  const heroTags: Array<{ key: string; label: string; variant?: "celeste" | "gray" }> = [];
  if (pet.jurisdictionLocality)
    heroTags.push({ key: "loc", label: pet.jurisdictionLocality, variant: "gray" });

  const breedLine = [pet.breed, pet.sex ? sexLabel(pet.sex) : null, age, speciesLabel(pet.species)]
    .filter(Boolean)
    .join(" · ");

  // In-Memoriam skin data (pet-document-redesign ADR-15) — presence of this
  // object is CredentialFace's memorial-mode switch.
  const memorial = isDeceased
    ? {
        birthYear: pet.dateOfBirth ? new Date(pet.dateOfBirth).getFullYear() : null,
        deathYear: pet.deceasedAt ? new Date(pet.deceasedAt).getFullYear() : null,
      }
    : null;

  // Compliance projection (comply-first slice §2) — leads Face 1's stamp row.
  // Pure derivation over data already loaded above: no extra query. The rabies
  // obligation reads the antirrábica reminder's precomputed variant when present.
  const rabiesReminderRow = petActiveReminders.find((r) => /antirr[aá]b|rabi/i.test(r.title));
  const reservedTurnoRow = reservedRabiesTurnoRows[0];
  const complianceState = deriveComplianceState({
    now: new Date(),
    events: typedEvents,
    // Who is reading — the rabies dual block says "cargada por vos" only when
    // this reader actually wrote the dose (transfer-provenance fix).
    viewerUserId: user.id,
    rabiesReminder: rabiesReminderRow
      ? { variant: rabiesReminderRow.variant, dueAt: rabiesReminderRow.dueAt }
      : null,
    reservedRabiesTurno: reservedTurnoRow
      ? {
          date: reservedTurnoRow.slotStartsAt,
          provider: reservedTurnoRow.orgName ?? reservedTurnoRow.vetName ?? null,
        }
      : null,
    microchipCode: canonicalIds.microchip?.code ?? null,
    microchipApplies: microchipRule.payload.required,
    pppApplies: Boolean(pet.potentiallyDangerousBreed),
    // PPP-indeterminado inputs: a DOG missing breed and/or weight surfaces the
    // obligation instead of hiding it (2026-07-04).
    species: pet.species,
    breed: pet.breed,
    estimatedWeightKg: pet.estimatedWeightKg,
  });

  // Hero "chip" tag — same provenance gate as the compliance card (see the
  // heroTags declaration above for why this isn't pushed alongside "loc").
  const microchipTagLabel = microchipHeroTag(complianceState);
  if (microchipTagLabel) heroTags.unshift({ key: "chip", label: microchipTagLabel });

  // Build the LnHero status from pet fields + compliance.
  // pet.status is "active" here, EXCEPT when the owner opened the full profile
  // of a lost pet via ?fromLost=1 (D9) — the lost early-return is bypassed but
  // the pet is still lost, so reflect that honestly in the hero ring. A
  // deceased pet still resolves to a non-lost state here (LnHero has no
  // memorial ring state) — the memorial skin lives entirely in CredentialFace's
  // `memorial` prop below (ribbon + sepia tone), which is a stronger signal.
  //
  // lnPetStatusFromCompliance is the SINGLE mapper shared with the /inicio
  // registry and the /mis-mascotas list, so the header chip and every row
  // chip always agree (QA round 2 2026-07-03 #4).
  const lnPetStatus = lnPetStatusFromCompliance(
    { status: pet.status, pregnancyStatus: pet.pregnancyStatus ?? null },
    complianceState,
  );

  // QR for the credential's Face 1 — same absolute-URL + inline-SVG pattern
  // as /mis-mascotas/nueva/[publicToken]/credencial and /cartel (no separate
  // image route; the previous `/p/{token}.png` route never existed).
  const credentialQrSvg = await QRCode.toString(credentialQrUrl(pet.publicToken), {
    type: "svg",
    margin: 1,
    width: 64,
    errorCorrectionLevel: "M",
  });

  // Prioritized alert strip (urgency-ordered): lost → rabies → transit →
  // open-cases → pregnancy. Built once so CredentialFace only grows an "Avisos"
  // section when it is genuinely non-empty (no empty divider). Same ordering
  // and same nodes as before the "Una sola libreta" redesign — now hosted
  // INSIDE the credential sheet instead of stacked below it.
  const petAlerts: PetAlert[] = [];
  if (pet.status === "lost") {
    petAlerts.push({
      id: "lost",
      tone: "urgent",
      node: (
        <LostCaseBlock
          pet={pet}
          photoUrl={photoUrl}
          episode={lostEpisode}
          scans={lostScans}
          ownerFirstName={ownerFirstName}
          alertsOriginShelter={alertsOriginShelter}
          isOwner={isOwner}
        />
      ),
    });
  }
  if (pet.rabiesObservationStatus === "in_progress") {
    petAlerts.push({
      id: "rabies",
      tone: "urgent",
      node: <RabiesObservationBanner pet={pet} events={typedEvents} />,
    });
  }
  if (isTransit) {
    petAlerts.push({
      id: "transit",
      tone: "warning",
      // "Convertir en mi mascota" / "Buscar nuevo hogar" are org-mediated
      // foster actions (FosterRepository.findActiveFosterByUser, /buscar-hogar
      // require role='foster') — a vecino-helps-stray shelter_custody row has
      // no org link, so those CTAs would dead-end for it. Only offer them to
      // the actual org-linked foster role; the vecino still gets the banner
      // text + badge, just not actions that assume an org relationship.
      node: (
        <TransitBanner
          petName={pet.name}
          petPublicToken={pet.publicToken}
          canManageFosterActions={ownershipRole === "foster"}
        />
      ),
    });
  }
  if (allCases.some((c) => c.status === "open" || c.status === "escalated")) {
    petAlerts.push({
      id: "open-cases",
      tone: "warning",
      node: (
        <div data-section="cases">
          <PetOpenCasesSection petId={pet.id} />
        </div>
      ),
    });
  }
  if (pregnancyCardData) {
    petAlerts.push({
      id: "pregnancy",
      tone: "info",
      node: (
        <PregnancyInProgressCard
          petPublicToken={pet.publicToken}
          pregnancyStartedAt={pregnancyCardData.startedAt}
          weeksAtDiagnosis={pregnancyCardData.weeksAtDiagnosis}
          expectedBirthAt={pregnancyCardData.expectedBirthAt}
          lastClinicalAt={pregnancyCardData.lastClinicalAt}
        />
      ),
    });
  }

  // Pet SITUATION (state-language, #42) — the single derivation of "what this
  // pet is going through", a separate axis from compliance/registration. The
  // credential adopts its skin only for a non-default, non-deceased situation
  // (deceased keeps the memorial skin above — the two never stack).
  const petSituation = derivePetSituation({
    status: pet.status,
    rabiesObservationStatus: pet.rabiesObservationStatus,
    pregnancyStatus: pet.pregnancyStatus,
    inTransit: isTransit,
    // pet-state-header R2.6 — previously-unwired inputs, all derived from data
    // this page already loads (plus the bounded custody query in Stage 1):
    // an open medication course = en tratamiento (same projection the Libreta
    // health dashboard uses — no auto-derivation from open cases).
    inTreatment: computeMedicationsActive(typedEvents).length > 0,
    inAdoption: Boolean(pet.adoptionListedAt) && !pet.adoptionListingPausedAt,
    underOfficialCustody: openCustodyEpisodeRows.length > 0,
  });
  const credentialSituation = !isDeceased && !petSituation.isDefault ? petSituation : null;
  // Chrome band situation (pet-state-header) — the masthead carries the state
  // on BOTH faces. One documented asymmetry vs the face body: DECEASED tints
  // the band (memorial sepia + "Fallecido/a" chip) while CredentialFace still
  // receives situation=null (the memorial skin owns the face body; the two
  // skins never stack there — the band is chrome-owned).
  const chromeSituationSource = isDeceased ? PET_SITUATIONS.fallecida : credentialSituation;
  const chromeSituation = chromeSituationSource
    ? {
        key: chromeSituationSource.key,
        tone: chromeSituationSource.tone,
        icon: chromeSituationSource.icon,
        label: situationLabelForSex(chromeSituationSource.label, pet.sex),
      }
    : null;
  // The situation pill carries the LABEL only ("Perdida"/"Preñada") — the date
  // suffix was dropped (owner-ia-redesign P1): LostCaseBlock and
  // PregnancyInProgressCard already show the date, so the pill repeating it
  // was the one real duplicate the PO found.

  // owner-ia-redesign P4 — the credential carousel ("the heart"). The profile
  // SWIPES between the owner's LIVE pets, urgent-first (shared pet-urgency-rank),
  // deceased NEVER in the swipe (decision 6). Owner-only: org/admin/public/vet
  // viewers of the same route get no chrome (shouldShowCarousel gates on
  // isOwner). Bounded and reuses the SAME owner-dashboard fetchers + compliance→
  // status mapper that /inicio and the header use, so the position dots agree
  // with every other owner surface (the cross-pet glance). Cost note (perf
  // watchpoint): this adds the pet-list + batch-compliance queries on the owner
  // path only — the same price /inicio already pays for its rail.
  let carouselPets: CarouselPet[] = [];
  // Avatar switcher (PO "reemplazo total" of the dots): the ranked/capped set
  // enriched with each pet's name + photo. Populated AFTER ranking so the photo
  // join runs only over the ≤8 shown tokens — not every live pet (the ranking
  // query stays deliberately narrow, see fetchLivePetsForCarouselRanking).
  let avatarPets: AvatarSwitcherPet[] = [];
  // D2: the TRUE number of live pets across the household. The swipe is capped at
  // OWNER_CAROUSEL_CAP (glanceable dots), but /mis-mascotas lists every live pet,
  // so the two silently disagreed (e.g. 8 dots vs 14 in the index). The carousel
  // uses this to show an honest "Mostrando N de M" instead of differing silently.
  let liveTotal = 0;
  if (isOwner) {
    // Rank over EVERY live ownership (uncapped), not the newest 50 — otherwise a
    // most-urgent pet beyond the cap would be absent from the swipe (QA ronda 4
    // CONFIRMED). fetchLivePetsForCarouselRanking already excludes deceased.
    const livePets = await fetchLivePetsForCarouselRanking(user.id);
    liveTotal = livePets.length;
    const complianceStates = await fetchComplianceStatesForPets(
      user.id,
      livePets.map((p) => p.id),
    );
    carouselPets = rankOwnerCarousel(
      livePets.map((p) => {
        const compliance = complianceStates.get(p.id);
        return {
          token: p.publicToken,
          status: p.status,
          pregnancyStatus: p.pregnancyStatus,
          complianceStatus: compliance
            ? lnPetStatusFromCompliance(
                { status: p.status, pregnancyStatus: p.pregnancyStatus ?? null },
                compliance,
              )
            : null,
        };
      }),
    );

    // Enrich the capped set with name + photo for the avatar switcher (one
    // bounded query over the ≤8 shown tokens; leftJoin so a photo-less pet
    // falls back to LnPetPhoto's placeholder).
    if (carouselPets.length > 0) {
      const photoRows = await db
        .select({
          token: pets.publicToken,
          name: pets.name,
          storagePath: attachments.storagePath,
        })
        .from(pets)
        .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
        .where(
          inArray(
            pets.publicToken,
            carouselPets.map((p) => p.token),
          ),
        );
      const byToken = new Map(
        photoRows.map((r) => [r.token, { name: r.name, photoUrl: petPhotoUrl(r.storagePath) }]),
      );
      avatarPets = carouselPets.map((p) => ({
        token: p.token,
        status: p.status,
        name: byToken.get(p.token)?.name ?? "",
        photoUrl: byToken.get(p.token)?.photoUrl ?? null,
      }));
    }
  }
  const showCarousel = shouldShowCarousel({
    isOwner,
    tokens: carouselPets.map((p) => p.token),
    currentToken: pet.publicToken,
  });

  // owner-ia-redesign P2: pet-level override with account fallback. Resolution
  // is pure (lib/domain/emergency-contacts.ts) — the pet's own columns win per
  // row, else the owner's profile default shows (tagged "de tu cuenta" in the
  // block). Non-owners get null (no block), and so do foster/transit holders —
  // legal owners only (M2 fresh-review required fix 2). Hoisted (used by both
  // the emergencyContacts prop below AND the "Primeros pasos" checklist).
  const resolvedEmergencyContacts =
    isOwner && ownershipRole === "owner"
      ? resolveEmergencyContacts(
          {
            preferredVetName: pet.preferredVetName,
            preferredVetPhone: pet.preferredVetPhone,
            emergencyContactName: pet.emergencyContactName,
            emergencyContactPhone: pet.emergencyContactPhone,
          },
          {
            preferredVetName: viewerContacts?.preferredVetName ?? null,
            preferredVetPhone: viewerContacts?.preferredVetPhone ?? null,
            emergencyContactName: viewerContacts?.emergencyContactName ?? null,
            emergencyContactPhone: viewerContacts?.emergencyContactPhone ?? null,
          },
        )
      : null;

  // "Primeros pasos" owner-onboarding checklist (lib/projections/
  // first-steps-checklist.ts) — legal owner only, never for a deceased pet (a
  // closed life record has no onboarding left to do). Empty array on every
  // other viewer/state renders no section (CredentialFace's `firstSteps.length
  // > 0` gate).
  const firstSteps =
    isOwner && ownershipRole === "owner" && !isDeceased
      ? deriveFirstStepsChecklist({
          petPublicToken: pet.publicToken,
          hasPhoto: Boolean(pet.primaryPhotoId),
          hasMicrochip: canonicalIds.microchip !== null,
          hasVaccineRecorded: typedEvents.some((e) => e.eventType === "vaccination_administered"),
          hasEmergencyContact: resolvedEmergencyContacts?.emergency !== null,
          disclosurePrefsDecided: hasReviewedDisclosurePrefs(pet),
          dismissedKeys: pet.dismissedFirstSteps,
        })
      : [];

  // Libreta face (Face 2) — server-rendered, streamed via its OWN Suspense
  // boundary so it never blocks Face 1's SSR paint (PF3 perf fix — see
  // LibretaFaceSection above).
  // `op-fade-in` on the STREAMED child, not on the page body: Face 1 has
  // already SSR-painted by the time this flushes, so the fade lands on a
  // section arriving into a stable shell — the one shape the motion audit
  // sanctions (§5.7 forbids it on a route body, where it would delay first
  // legible text). Same placement as the 19 uses on /admin/sistema.
  const libretaContent = (
    // degraded-states: fallback escalates to waiting text / degraded card if
    // the stream stalls (pure CSS — components/ui/DegradedFallback.tsx).
    <Suspense
      fallback={
        <DegradedFallback>
          <TabLoadingSkeleton />
        </DegradedFallback>
      }
    >
      <LibretaFaceSection
        user={user}
        pet={pet}
        accessPath={accessPath}
        organization={organization}
        isOwner={isOwner}
        emergencyContacts={resolvedEmergencyContacts}
      />
    </Suspense>
  );

  // The credential document — server-rendered per route. A swipe/key/dot is a
  // NAVIGATION to the neighbor's route, not a client pane slide, so this same
  // node renders whether or not the carousel gesture shell wraps it.
  const documentNode = (
    // degraded-states: same escalation as libretaContent above.
    <Suspense
      fallback={
        <DegradedFallback>
          <div className="h-12 rounded-[var(--radius-sm)] bg-[var(--color-ln-stripe)] animate-pulse" />
        </DegradedFallback>
      }
    >
      <PetDetailTabsPanel
        petPublicToken={pet.publicToken}
        initialFace={activeFace}
        isOwner={isOwner}
        situation={chromeSituation}
        libretaContent={libretaContent}
        credencialContent={
          // The whole front face is ONE framed sheet ("Una sola libreta"):
          // identity → Cumplimiento → Avisos → Anotar → action row, bound by
          // labeled hairline dividers inside CredentialFace. H1 provenance
          // gates the stamp row. Deceased (ADR-15/REQ-9.3): `anotar` is null
          // (a closed life record accepts no new events) and `actions`
          // collapses to [Compartir][Más]; org viewers get the same read-only
          // object with a null `anotar`.
          <CredentialFace
            heroProps={{
              name: pet.name,
              status: lnPetStatus,
              breed: breedLine,
              photoSrc: photoUrl ?? undefined,
              // Empty-state shortcut: with no photo, the 132px placeholder is
              // the tap target that opens the edit sheet already mounted on
              // this page — same form, same file input, same action. Gated on
              // isOwner because this page also renders for a vet or a shelter
              // reading the credential, and they cannot save it.
              addPhotoHref: isOwner
                ? `/mis-mascotas/${pet.publicToken}?sheet=editar-mascota`
                : undefined,
              tags: heroTags,
            }}
            complianceState={complianceState}
            qrSvg={credentialQrSvg}
            publicHref={`/p/${pet.publicToken}`}
            serviceDog={
              serviceDogRow &&
              serviceDogRow.credentialStatus === "vigente" &&
              serviceDogRow.inService
                ? {
                    serviceTypeLabel:
                      SERVICE_TYPE_LABELS[serviceDogRow.serviceType] ?? serviceDogRow.serviceType,
                    manageHref: `/mis-mascotas/${pet.publicToken}/asistencia`,
                    presentHref: buildPresentarHref(pet.publicToken),
                  }
                : null
            }
            petPublicToken={pet.publicToken}
            petSex={pet.sex}
            memorial={memorial}
            situation={credentialSituation}
            avisos={petAlerts.length > 0 ? <PetAlertStrip alerts={petAlerts} /> : null}
            firstSteps={firstSteps}
            // 3b improvement C — the embedded mid-face capture textarea was
            // REMOVED to declutter the front. Capture now lives in the fixed
            // "Asentar un hecho" bar (CitizenTabBar, mobile — task #9) and, as
            // a pet-specific one-tap shortcut on every breakpoint, in the
            // PetActionRow "Anotar" quiet link below (opens ?sheet=anotar for
            // THIS pet). No `anotar` node is passed, so CredentialFace's inline
            // "Anotar" section stays dormant (owners still write while lost —
            // the /anotar sheet is gated on owner + not-deceased, unchanged).
            actions={
              <PetActionRow
                petPublicToken={pet.publicToken}
                isOwner={isOwner}
                isDeceased={isDeceased}
                petStatus={pet.status as "active" | "lost" | "deceased"}
              />
            }
          />
        }
      />
    </Suspense>
  );

  return (
    <div
      className="mx-auto max-w-4xl pb-12 px-4 md:px-8"
      style={{ fontFamily: "var(--font-ln-sans)" }}
    >
      {/* Back link — ORG viewers only. For owners the global AppShell nav
          already carries "Mis mascotas", so a second page-level "← Mis
          mascotas" right under it read as confusing duplication (PO). Org
          viewers need it because "Animales en custodia" is a distinct
          destination the global nav doesn't cover. */}
      {accessPath === "org" && organization && (
        <Link
          href={`/org/${organization.publicToken}/mascotas`}
          className="mb-[18px] mt-4 inline-block font-ln-mono text-sm uppercase tracking-[.06em] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
          data-section="back-link"
        >
          ← Animales en custodia
        </Link>
      )}

      {/* Org-mediated access notice */}
      {accessPath === "org" && organization && (
        <div className="mb-3.5 rounded-[var(--radius-sm)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-3.5 py-2.5 text-md text-[var(--color-ln-ink-2)]">
          Estás viendo {pet.name} como miembro de <strong>{organization.displayName}</strong>.
          Cualquier evento que registres queda atribuido a la organización.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Two-face tabs: Credencial (eager) · Libreta (deferred). Face 1     */}
      {/* owns identity/credential + avisos + capture, per the new AGENTS.md */}
      {/* rule 5 block order (design.md ADR-1/ADR-6).                        */}
      {/*                                                                    */}
      {/* owner-ia-redesign P4 — when the owner has more than one live pet,   */}
      {/* the document is wrapped by the INVISIBLE carousel gesture shell     */}
      {/* (constrained swipe + keyboard + prefetch). Non-owner viewers, and   */}
      {/* owners with a single live pet, get the bare document (no shell).    */}
      {/*                                                                    */}
      {/* PO correction (2026-07-18, reversing tarjeta-todo's dots-in-band    */}
      {/* placement): "El carousel lo quiero FUERA de la credencial. No       */}
      {/* tiene nada que ver la navegación en la app con la credencial        */}
      {/* digital de una mascota." The credential is ONE pet's document;      */}
      {/* switching between pets is APP-LEVEL navigation, a different layer   */}
      {/* — PetSwitcherDots mounts here, ABOVE the card, never touching the   */}
      {/* credential's frame/band. Same gate as the swipe shell (owner + >1   */}
      {/* live pet); single-pet owners and non-owners get no nav element.     */}
      {/* ------------------------------------------------------------------ */}
      {showCarousel && (
        <PetSwitcherAvatars
          pets={avatarPets}
          currentToken={pet.publicToken}
          liveTotal={liveTotal}
        />
      )}
      {showCarousel ? (
        <PetCredentialCarousel pets={carouselPets} currentToken={pet.publicToken}>
          {documentNode}
        </PetCredentialCarousel>
      ) : (
        documentNode
      )}

      {/* Quick-capture sheets — driven by ?sheet=<id> URL param.
            Renders nothing when the param is absent or unknown.
            Lives outside PetDetailTabsPanel so it's always mounted. */}
      <SheetMounter
        petToken={pet.publicToken}
        petName={pet.name}
        petSex={pet.sex}
        species={pet.species}
        petStatus={pet.status as "active" | "lost" | "deceased"}
        accessPath={accessPath === "org" ? "org" : "owner"}
        ownershipRole={ownershipRole}
        hasPendingReturnProposal={hasPendingReturnProposal}
        tier2PublicEnabledUntil={
          pet.tier2PublicEnabledUntil ? new Date(pet.tier2PublicEnabledUntil).toISOString() : null
        }
        tier2PublicPermanent={pet.tier2PublicPermanent}
        markLostData={
          pet.status === "active"
            ? {
                petHasMicrochip: canonicalIds.microchip !== null,
                petHasTattoo: canonicalIds.tattoo !== null,
                petColor: pet.color ?? null,
                petDistinguishingFeatures: pet.distinguishingFeatures ?? null,
                petJurisdictionProvince: pet.jurisdictionProvince ?? null,
                petJurisdictionLocality: pet.jurisdictionLocality ?? null,
              }
            : null
        }
        editPetData={{
          // Client props reach EVERY viewer of this route (org included) —
          // never ship the pet-level emergency-contact columns here. PetForm
          // does not read them; nulling keeps the Pet shape without the PII
          // (M2 fresh-review required fix 1).
          existingPet: {
            ...pet,
            preferredVetName: null,
            preferredVetPhone: null,
            emergencyContactName: null,
            emergencyContactPhone: null,
          },
          existingPhotoUrl: editPhotoUrl,
          pppBreedList: pppBreedRule.payload.breeds,
        }}
        chapitaData={chapitaData}
        alertsOriginShelter={alertsOriginShelter}
        showCheckinOption={showCheckinOption}
        physicalCredentialChannels={physicalCredentialChannels}
        emergencyContacts={
          // The edit sheet writes the PET-LEVEL override (owner-ia-redesign P2),
          // so its initial values are this pet's own columns (empty when unset),
          // NOT the account default. Clearing a field falls back to the account.
          // Gated on the LEGAL ownership role, not just accessPath: a foster /
          // transit holder is accessPath "owner" but must not see or edit the
          // legal owner's emergency contacts (M2 fresh-review required fix 2 —
          // matches the write path, which enforces ownerships.role = 'owner').
          isOwner && ownershipRole === "owner"
            ? {
                preferredVetName: pet.preferredVetName ?? "",
                preferredVetPhone: pet.preferredVetPhone ?? "",
                emergencyContactName: pet.emergencyContactName ?? "",
                emergencyContactPhone: pet.emergencyContactPhone ?? "",
              }
            : null
        }
        disclosurePrefs={
          // "Primeros pasos" star item (?sheet=privacidad) — same LEGAL-owner
          // gate as emergencyContacts above: a foster/transit holder must not
          // review or edit the legal owner's lost-mode disclosure choices.
          isOwner && ownershipRole === "owner" && !isDeceased
            ? {
                discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
                disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
                discloseEmailWhenLost: pet.discloseEmailWhenLost,
                discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
                allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
              }
            : null
        }
        ownerFirstName={ownerFirstName}
      />

      {/* PostCreateModal was deleted (flow audit 2026-07-03 + PO decision):
            the credencial aha page owns the post-create moment; nothing
            produced ?recienCreado=true anymore, so the modal was dead code
            stacking a third celebration screen when it did fire. */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Former-owner READ-ONLY custody view (PO decision 2026-07-18)
//
// A deliberately minimal, self-contained render — NOT a stripped-down
// CredentialFace/Libreta. This view never touches the carousel/compliance
// machinery those components own; it renders directly from the bare `pets`
// row getFormerOwnerReadAccess already resolved. No edit affordances, no
// action row, no Anotar — read-only means read-only.
// ---------------------------------------------------------------------------

function FormerOwnerCustodyReadOnlyView({
  pet,
  casePublicCode,
}: {
  pet: {
    name: string;
    species: string;
    breed: string | null;
    sex: "male" | "female" | "unknown" | null;
    dateOfBirth: string | null;
  };
  casePublicCode: string;
}) {
  // No death cut-off here: getFormerOwnerReadAccess's pet payload is a narrow
  // read-only projection that does not carry deceasedAt, and widening that query
  // for a pet that is BOTH deceased and under an open custody dispute buys
  // nothing. The main profile above passes it (master test CIU, B0b).
  const age = ageFromDateOfBirth(pet.dateOfBirth);
  const breedLine = [pet.breed, pet.sex ? sexLabel(pet.sex) : null, age, speciesLabel(pet.species)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="mx-auto max-w-4xl pb-12 px-4 md:px-8"
      style={{ fontFamily: "var(--font-ln-sans)" }}
    >
      <Link
        href="/mis-mascotas"
        className="mb-[18px] mt-4 inline-block font-ln-mono text-sm uppercase tracking-[.06em] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
        data-section="back-link"
      >
        ← Mis mascotas
      </Link>

      <section
        className="mb-3.5 rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-4 py-3.5 space-y-1.5"
        data-section="former-owner-custody-banner"
      >
        <p className="font-semibold text-md text-[var(--color-ln-warn)]">
          Custodia oficial en curso
        </p>
        <p className="text-md text-[var(--color-ln-warn)]">
          Tu mascota está bajo custodia oficial — acceso de solo lectura mientras dure el proceso.
          Caso {casePublicCode}.
        </p>
      </section>

      <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-stripe)] px-4 py-3.5">
        <h1 className="text-lg font-semibold text-[var(--color-ln-ink)]">{pet.name}</h1>
        {breedLine && <p className="text-md text-[var(--color-ln-mute)]">{breedLine}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banners — PRESERVED
// ---------------------------------------------------------------------------

type RabiesObservationBannerProps = {
  pet: { name: string; publicToken: string };
  events: Array<{ id: string; eventType: string; occurredAt: Date | string; payload: unknown }>;
};

function RabiesObservationBanner({ pet, events }: RabiesObservationBannerProps) {
  const startedEvent = events.find((e) => e.eventType === "rabies_observation_started");
  const startedPayload = (startedEvent?.payload ?? {}) as Record<string, unknown>;
  const observationUntilRaw = startedPayload.observation_until as string | undefined;
  const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;

  const biteEvent = events.find(
    (e) =>
      e.eventType === "incident_reported" &&
      (e.payload as Record<string, unknown> | null)?.incident_type === "bite_inflicted",
  );
  const biteDate = biteEvent ? new Date(biteEvent.occurredAt) : null;

  const periodClosed =
    observationUntil !== null &&
    Number.isFinite(observationUntil.getTime()) &&
    observationUntil <= new Date();

  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-4 py-3.5 space-y-[10px]">
      <p className="font-semibold text-md text-[var(--color-ln-warn)]">Vigilancia por mordedura</p>
      <p className="text-md text-[var(--color-ln-warn)]">
        {biteDate
          ? `Por la mordedura del ${formatDateShort(biteDate)}, `
          : "Por una mordedura reportada recientemente, "}
        {pet.name} está en observación obligatoria de 10 días.
        {observationUntil && ` Cierre estimado: ${formatDateShort(observationUntil)}.`}
      </p>
      <p className="text-sm text-[var(--color-ln-warn)]">
        Si {pet.name} muestra salivación excesiva, agresividad inusual, parálisis o cambios bruscos
        de comportamiento, consultá al veterinario de inmediato.
      </p>
      {/* RA-2 F3: this close can be REFUSED, and the most important refusal is
          "hubo síntomas compatibles con rabia … Contactá a tu vet." The inline
          server action that used to live here awaited the result and threw it
          away, so that warning never reached the owner. */}
      {periodClosed && <CloseRabiesObservationButton petPublicToken={pet.publicToken} />}
    </section>
  );
}

function TransitBanner({
  petName,
  petPublicToken,
  canManageFosterActions,
}: {
  petName: string;
  petPublicToken: string;
  /** True only for an org-linked `role='foster'` row — see call site. */
  canManageFosterActions: boolean;
}) {
  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-4 py-3.5 space-y-[10px]">
      <p className="text-md text-[var(--color-ln-warn)]">
        Estás cuidando a <strong>{petName}</strong> en tránsito. La libreta sanitaria que armes acá
        viaja con la mascota.
      </p>
      {canManageFosterActions && (
        <div className="flex flex-wrap gap-2">
          <ConvertFosterButton petPublicToken={petPublicToken} petName={petName} />
          <Link
            href={`/mis-mascotas/${petPublicToken}/buscar-hogar`}
            className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] px-2.5 py-1.5 text-md text-[var(--color-ln-warn)] no-underline hover:bg-white transition-colors"
          >
            Buscar nuevo hogar
          </Link>
        </div>
      )}
    </section>
  );
}
