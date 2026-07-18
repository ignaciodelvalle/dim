// ---------------------------------------------------------------------------
// PET PROFILE — "two-face" redesign (Credencial | Libreta), 2026-07-01
// Spec: docs/design/handoffs/2026-07-01-pet-profile-two-face-lean-handoff.md
// AGENTS.md "Design rules" #5 documents the shipped block order.
//
// This RSC is now a thin data-fetch + assembly shell. The two faces
// themselves (and everything they render) live in dedicated components:
//   - CredentialFace (Face 1, server, eager)   — components/pet-profile/CredentialFace.tsx
//   - LibretaFace     (Face 2, client, deferred) — components/pet-profile/LibretaFace.tsx
//   - PetDetailTabsPanel — owns the tab switcher + Face 2's deferred fetch.
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

import { PetOpenCasesSection } from "@/components/PetOpenCasesSection";
import { PregnancyInProgressCard } from "@/components/PregnancyInProgressCard";
import { CredentialFace } from "@/components/pet-profile/CredentialFace";
import { LostCaseBlock } from "@/components/pet-profile/LostCaseBlock";
import { PetActionRow } from "@/components/pet-profile/PetActionRow";
import { type PetAlert, PetAlertStrip } from "@/components/pet-profile/PetAlertStrip";
import { PetCredentialCarousel } from "@/components/pet-profile/PetCredentialCarousel";
import { PetDetailTabsPanel } from "@/components/pet-profile/PetDetailTabsPanel";
import { PetOwnerActivity } from "@/components/pet-profile/PetOwnerActivity";
import { filterProfileWorkflows } from "@/components/pet-profile/profile-workflow-filter";
import {
  appointments,
  attachments,
  cases,
  db,
  organizations,
  ownerships,
  petServiceDog,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import {
  fetchActiveRemindersForPet,
  fetchComplianceStatesForPets,
  fetchLivePetsForCarouselRanking,
  fetchOpenWorkflows,
  fetchPetEventsForProfileV2,
  fetchUpcomingAppointments,
} from "@/lib/analytics/owner-dashboard";
import { resolveEmergencyContacts } from "@/lib/domain/emergency-contacts";
import { computeMedicationsActive } from "@/lib/domain/libreta-health-status";
import {
  type CarouselPet,
  rankOwnerCarousel,
  shouldShowCarousel,
} from "@/lib/domain/owner-carousel";
import { buildFromLostRedirectTarget, resolvePetFace } from "@/lib/domain/pet-face-nav";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { GENERIC_CASE_LIST_EXCLUDED_KINDS } from "@/lib/infra/case-queries";
import { fetchLostEpisodeForPet, fetchLostScanEvents } from "@/lib/infra/lost-mode";
import { fetchPetHealthNudges } from "@/lib/infra/owner-nudges";
import { requirePetAccess } from "@/lib/infra/pet-access";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { resolvePhysicalCredentialChannels } from "@/lib/infra/physical-credential-channels";
import { getPhysicalTagInterest } from "@/lib/infra/physical-tag-interest";
import { SERVICE_TYPE_LABELS, buildPresentarHref } from "@/lib/infra/service-dog-labels";
import { credentialQrUrl } from "@/lib/infra/site-url";
import { eventAttachmentSignedUrl, petPhotoUrl } from "@/lib/infra/storage";
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
import { fetchPendingReturnProposalForOwner } from "@/src/modules/return-to-owner/application/proposal-queries";
import { and, asc, desc, eq, gt, isNull, notInArray } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { SheetMounter } from "./SheetMounter";
import { ConvertFosterButton } from "./_components/ConvertFosterButton";
import { resolveCaptureIntentUrl } from "./anotar/handoff";

// ---------------------------------------------------------------------------
// Pet-state standardization (PO 2026-07-16): the masthead band (chromeSituation
// below) is the single state authority on this page. The old page-local
// derivePetState/derivePetStateLabel helpers (a third, unused state mapping)
// were removed — derivePetSituation (lib/ui/pet-situation.ts) is the one
// derivation every surface reads. The "Ciclos abiertos" dedup filter lives in
// components/pet-profile/profile-workflow-filter.ts (pure, unit-tested).
// ---------------------------------------------------------------------------

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
      redirect(`/login?returnTo=${encodeURIComponent(`/mis-mascotas/${publicToken}`)}`);
    }
    notFound();
  }
  const { supabase, user, pet, accessPath, organization } = access;

  const isOwner = accessPath === "owner";

  // No-flash capture routing (code review 2026-07-03): when a deep link /
  // notification / home EventCatcher lands on `?sheet=anotar` carrying a
  // resolvable intent (a known `kind`, or free text the deterministic matcher
  // recognizes), resolve it HERE and redirect server-side — before any render.
  // The old client-side ResolvedCaptureRedirect wasted a full profile render
  // and used router.replace on the cross-route hop, inheriting the Next 15.5
  // silent-drop defect that lib/ui/sheet-nav.ts exists to route around. Only
  // owners capture (REQ-4.4) and never for a deceased pet (REQ-9.3); an
  // unresolvable `?sheet=anotar` falls through to SheetMounter's sheet.
  if (sp.sheet === "anotar" && isOwner && pet.status !== "deceased") {
    const captureTarget = resolveCaptureIntentUrl(publicToken, {
      kind: typeof sp.kind === "string" ? sp.kind : undefined,
      text: typeof sp.text === "string" ? sp.text : undefined,
    });
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

  // isTransit = true for users with an active foster ownership row.
  // Note: shelter_custody is an org-level role (ownerOrganizationId), not a
  // user-level role, so it cannot appear here via the ownerUserId path.
  let isTransit = false;
  let ownershipRole: string | null = null;
  if (accessPath === "owner") {
    isTransit = ownerRow?.role === "foster";
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

    const [returnProposalResult, [profileRow], chapitaState, channels] = await Promise.all([
      returnProposalQuery,
      contactsQuery,
      chapitaQuery,
      physicalCredentialChannelsQuery,
    ]);

    hasPendingReturnProposal = returnProposalResult;
    viewerContacts = profileRow ?? null;
    chapitaData = chapitaState;
    physicalCredentialChannels = channels;
  }

  // Jurisdiction-resolved PPP breed list for the in-profile edit sheet, so a
  // locality that ADDED a breed via the admin console flags it in the sheet's
  // inline "raza peligrosa" warning too — parity with the standalone /editar
  // page (2026-07-04). Display-only; submit-time classification stays
  // authoritative regardless.
  const pppBreedRule = await resolveBusinessRule("ppp_breed_list", {
    province: pet.jurisdictionProvince,
    locality: pet.jurisdictionLocality,
  });

  // Jurisdiction gate for the microchip obligation (jurisdiction-compliance):
  // resolves the microchip_required rule for the pet's jurisdiction. Default is
  // TRUE everywhere (no override rows at rollout), so the microchip card keeps
  // showing until a jurisdiction opts out with a { required: false } rule.
  const microchipRule = await resolveBusinessRule("microchip_required", {
    province: pet.jurisdictionProvince,
    locality: pet.jurisdictionLocality,
  });

  // Lost-episode + scans fetch — relocated out of the old early-return into
  // the mainline (pet-document-redesign REQ-5.1/ADR-7): runs unconditionally
  // when `status === 'lost'`, for BOTH owner and org viewers, since the
  // normal profile now always renders and LostCaseBlock (rendered below, in
  // the alert strip) needs this data for both roles — org gets the
  // read-only variant, not a separate cockpit.
  let lostEpisode: Awaited<ReturnType<typeof fetchLostEpisodeForPet>> = null;
  let lostScans: Awaited<ReturnType<typeof fetchLostScanEvents>> = [];
  if (pet.status === "lost") {
    // Fetch episode first so we can pass its caseId to the scan feed query.
    // This scopes sighting rows to the current episode and prevents cross-episode
    // pollution when a pet was lost→found→lost again.
    lostEpisode = await fetchLostEpisodeForPet(pet.id);
    const rawScans = await fetchLostScanEvents(pet.id, undefined, lostEpisode?.id ?? undefined);

    // P0g: resolve signed URLs for sighting AND finder-in-possession items that
    // carry a photoStoragePath. event-attachments is a private bucket so
    // thumbnails need short-lived signed URLs. We use the SSR supabase client
    // (owner is authenticated at this point; org viewers reach here too and
    // share the same signed-URL resolution).
    lostScans = await Promise.all(
      rawScans.map(async (item) => {
        if ((item.kind === "sighting" || item.kind === "finder") && item.photoStoragePath) {
          const url = await eventAttachmentSignedUrl(supabase, item.photoStoragePath);
          return { ...item, photoUrl: url };
        }
        return item;
      }),
    );
  }

  // Derive owner first name from displayName (first word only) — feeds
  // LostCaseBlock's disclosure preview copy for owner viewers only.
  const ownerFirstName = viewerContacts?.displayName
    ? (viewerContacts.displayName.split(" ")[0] ?? viewerContacts.displayName)
    : "el dueño";

  // v2 targeted queries — replaces the old O(N) events + attachment signing.
  const { typedEvents } = await fetchPetEventsForProfileV2(pet.id);

  // Pregnancy card data — derived from typedEvents (clinical_info_logged events
  // are in the whitelist so they're available here).
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

  // Remaining parallel queries feeding the compliance projection + hero tags.
  // Achievements, medication doses, upcoming appointments, and weight history
  // moved out of Face 1 entirely (design.md deletion list) — Face 2 re-queries
  // its own future/weight sources inside getLibretaFaceData when it activates.
  const [
    petActiveReminders,
    canonicalIds,
    reservedRabiesTurnoRows,
    petUpcomingAppointments,
    petOpenWorkflows,
    petHealthStatuses,
  ] = await Promise.all([
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
    // owner-ia-redesign P3 — the pet profile absorbs its own reminders/turnos/
    // open cycles. Owner-only, pet-scoped: the SAME fetchers /inicio uses,
    // filtered to this pet. `/inicio` still renders the cross-pet versions this
    // phase (transitional duplication; removal is P5's gate).
    accessPath === "owner"
      ? fetchUpcomingAppointments(user.id, 5, pet.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchUpcomingAppointments>>),
    accessPath === "owner"
      ? fetchOpenWorkflows(user.id, pet.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchOpenWorkflows>>),
    // owner-ia-redesign P5 — this pet's per-pet health nudges (chip_missing CTA,
    // scan-activity signal). fetchPetHealthNudges returns the owner's whole
    // owned-and-active set (bounded, role='owner' only); we filter to THIS pet
    // below. Orphaned when the /inicio PetHealthStatusStrip was deleted; now
    // rendered inside the profile via PetOwnerActivity.
    accessPath === "owner"
      ? fetchPetHealthNudges(user.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchPetHealthNudges>>),
  ]);

  // This pet's nudges only (fetchPetHealthNudges is owner-wide; scope by id).
  const thisPetNudges = petHealthStatuses.find((s) => s.petId === pet.id)?.nudges ?? [];

  const age = ageFromDateOfBirth(pet.dateOfBirth);

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
      node: <TransitBanner petName={pet.name} petPublicToken={pet.publicToken} />,
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
  }
  const showCarousel = shouldShowCarousel({
    isOwner,
    tokens: carouselPets.map((p) => p.token),
    currentToken: pet.publicToken,
  });

  // The credential document — server-rendered per route. A swipe/arrow/dot is a
  // NAVIGATION to the neighbor's route, not a client pane slide, so this same
  // node renders whether or not the carousel chrome wraps it.
  const documentNode = (
    <Suspense
      fallback={
        <div className="h-12 rounded-[var(--radius-sm)] bg-[var(--color-ln-stripe)] animate-pulse" />
      }
    >
      <PetDetailTabsPanel
        petPublicToken={pet.publicToken}
        initialFace={activeFace}
        isOwner={isOwner}
        situation={chromeSituation}
        emergencyContacts={
          // owner-ia-redesign P2: pet-level override with account fallback.
          // Resolution is pure (lib/domain/emergency-contacts.ts) — the pet's
          // own columns win per row, else the owner's profile default shows
          // (tagged "de tu cuenta" in the block). Non-owners get null (no
          // block), and so do foster/transit holders — legal owners only
          // (M2 fresh-review required fix 2).
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
            : null
        }
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
          className="mb-[18px] mt-4 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-mute)] no-underline hover:text-[var(--color-ln-ink-2)]"
          data-section="back-link"
        >
          ← Animales en custodia
        </Link>
      )}

      {/* Org-mediated access notice */}
      {accessPath === "org" && organization && (
        <div className="mb-3.5 rounded-[var(--radius-sm)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-3.5 py-2.5 text-[13px] text-[var(--color-ln-ink-2)]">
          Estás viendo {pet.name} como miembro de <strong>{organization.displayName}</strong>.
          Cualquier evento que registres queda atribuido a la organización.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Two-face tabs: Credencial (eager) · Libreta (deferred). Face 1     */}
      {/* owns identity/credential + avisos + capture, per the new AGENTS.md */}
      {/* rule 5 block order (design.md ADR-1/ADR-6).                        */}
      {/*                                                                    */}
      {/* owner-ia-redesign P4 — when the owner has more than one live pet,  */}
      {/* the document is wrapped by the credential carousel shell (position */}
      {/* dots + desktop arrows + constrained swipe). Non-owner viewers, and */}
      {/* owners with a single live pet, get the bare document (no chrome).  */}
      {/* ------------------------------------------------------------------ */}
      {showCarousel ? (
        <PetCredentialCarousel
          pets={carouselPets}
          currentToken={pet.publicToken}
          liveTotal={liveTotal}
        >
          {documentNode}
        </PetCredentialCarousel>
      ) : (
        documentNode
      )}

      {/* owner-ia-redesign P3 — the profile absorbs its pet's content. This
          pet's reminders, turnos, and open cycles, below the document. Owner-
          only (org/public/vet viewers of the same route never see it) and
          pet-scoped. Renders nothing when the pet has none of the three. */}
      {isOwner && (
        <PetOwnerActivity
          nudges={thisPetNudges}
          reminders={petActiveReminders}
          appointments={petUpcomingAppointments}
          // Pet-state standardization (PO 2026-07-16): drop the rows that
          // repeat a state/case the profile already shows in its authoritative
          // surfaces — see profile-workflow-filter.ts.
          workflows={filterProfileWorkflows(petOpenWorkflows)}
        />
      )}

      {/* Quick-capture sheets — driven by ?sheet=<id> URL param.
            Renders nothing when the param is absent or unknown.
            Lives outside PetDetailTabsPanel so it's always mounted. */}
      <SheetMounter
        petToken={pet.publicToken}
        petName={pet.name}
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
      />

      {/* PostCreateModal was deleted (flow audit 2026-07-03 + PO decision):
            the credencial aha page owns the post-create moment; nothing
            produced ?recienCreado=true anymore, so the modal was dead code
            stacking a third celebration screen when it did fire. */}
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
      <p className="font-semibold text-[13px] text-[var(--color-ln-warn)]">
        Vigilancia por mordedura
      </p>
      <p className="text-[13px] text-[var(--color-ln-warn)]">
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
      {periodClosed && (
        <form
          action={async () => {
            "use server";
            const { ownerCloseRabiesObservationAction } = await import(
              "@/src/modules/surveillance/actions"
            );
            await ownerCloseRabiesObservationAction(pet.publicToken);
          }}
        >
          <button
            type="submit"
            className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-white px-3 py-1.5 font-[var(--font-ln-sans)] text-[13px] font-medium text-[var(--color-ln-warn)] transition-opacity hover:opacity-80"
          >
            Confirmar fin de observación
          </button>
        </form>
      )}
    </section>
  );
}

function TransitBanner({
  petName,
  petPublicToken,
}: {
  petName: string;
  petPublicToken: string;
}) {
  return (
    <section className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] px-4 py-3.5 space-y-[10px]">
      <p className="text-[13px] text-[var(--color-ln-warn)]">
        Estás cuidando a <strong>{petName}</strong> en tránsito. La libreta sanitaria que armes acá
        viaja con la mascota.
      </p>
      <div className="flex flex-wrap gap-2">
        <ConvertFosterButton petPublicToken={petPublicToken} petName={petName} />
        <Link
          href={`/mis-mascotas/${petPublicToken}/buscar-hogar`}
          className="rounded-[var(--radius-sm)] border border-[var(--color-ln-warn-100)] px-2.5 py-[5px] text-[13px] text-[var(--color-ln-warn)] no-underline hover:bg-white transition-colors"
        >
          Buscar nuevo hogar
        </Link>
      </div>
    </section>
  );
}
