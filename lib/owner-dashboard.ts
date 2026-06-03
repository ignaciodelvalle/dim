// Data layer for the owner dashboard at /inicio.
//
// Every export is a Promise<…[]> shaped to be consumed by a single widget.
// The page calls them in Promise.all to fan out fetching. Queries are
// indexed and capped at ≤ 10 rows where appropriate so the dashboard
// loads in one round-trip without N+1 surprises.
//
// Helpers in here MUST NOT throw — return empty arrays on no-data so the
// widgets can render the empty state uniformly.

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import {
  appointments,
  approvalRequests,
  attachments,
  cases,
  custodyDisputeParties,
  custodyDisputes,
  db,
  fosterProposals,
  notifications,
  organizations,
  ownerships,
  petEvents,
  petTransfers,
  pets,
  profiles,
  reminders,
  serviceOfferings,
  timeSlots,
  welfareReports,
} from "@/db";
import {
  type ReminderVariant,
  getReminderVariant,
  isVaccineReportable,
} from "@/lib/vaccine-reminder-state";

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

export type DashboardPet = {
  id: string;
  publicToken: string;
  name: string;
  species: string;
  status: string;
  color: string | null;
  primaryPhotoStoragePath: string | null;
  ownershipRole: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

export async function fetchPetsForOwner(userId: string): Promise<DashboardPet[]> {
  const rows = await db
    .select({
      pet: pets,
      photo: attachments,
      ownershipRole: ownerships.role,
    })
    .from(ownerships)
    .innerJoin(pets, eq(pets.id, ownerships.petId))
    .leftJoin(attachments, eq(attachments.id, pets.primaryPhotoId))
    .where(and(eq(ownerships.ownerUserId, userId), isNull(ownerships.endedAt)))
    .orderBy(desc(pets.createdAt));

  return rows.map((r) => ({
    id: r.pet.id,
    publicToken: r.pet.publicToken,
    name: r.pet.name,
    species: r.pet.species,
    status: r.pet.status,
    color: r.pet.color,
    primaryPhotoStoragePath: r.photo?.storagePath ?? null,
    ownershipRole: r.ownershipRole,
    jurisdictionProvince: r.pet.jurisdictionProvince,
    jurisdictionLocality: r.pet.jurisdictionLocality,
  }));
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export type UpcomingAppointment = {
  appointment: { publicToken: string; status: string };
  slot: { startsAt: Date };
  offering: { displayName: string; serviceKind: string; organizationId: string | null };
  pet: { name: string };
  org: { displayName: string } | null;
  provider: { displayName: string } | null;
};

export async function fetchUpcomingAppointments(
  userId: string,
  limit = 5,
): Promise<UpcomingAppointment[]> {
  const now = new Date();
  const rows = await db
    .select({
      appointment: { publicToken: appointments.publicToken, status: appointments.status },
      slot: { startsAt: timeSlots.startsAt },
      offering: {
        displayName: serviceOfferings.displayName,
        serviceKind: serviceOfferings.serviceKind,
        organizationId: serviceOfferings.organizationId,
      },
      pet: { name: pets.name },
      org: { displayName: organizations.displayName },
      provider: { displayName: profiles.displayName },
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(
      and(
        eq(appointments.ownerUserId, userId),
        eq(appointments.status, "confirmed"),
        gte(timeSlots.startsAt, now),
      ),
    )
    .orderBy(timeSlots.startsAt)
    .limit(limit);

  // Drizzle's leftJoin returns columns from the joined table that may be
  // null when the join didn't match. The shared AppointmentCard already
  // handles null org/provider; just normalize.
  return rows.map((r) => ({
    appointment: r.appointment,
    slot: r.slot,
    offering: r.offering,
    pet: r.pet,
    org: r.org?.displayName ? { displayName: r.org.displayName } : null,
    provider: r.provider?.displayName ? { displayName: r.provider.displayName } : null,
  }));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type DashboardNotification = {
  notification: typeof notifications.$inferSelect;
  pet: { publicToken: string; name: string } | null;
};

export async function fetchUnreadNotifications(
  userId: string,
  limit = 5,
): Promise<DashboardNotification[]> {
  const rows = await db
    .select({ notification: notifications, pet: pets })
    .from(notifications)
    .leftJoin(pets, eq(notifications.relatedPetId, pets.id))
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    notification: r.notification,
    pet: r.pet ? { publicToken: r.pet.publicToken, name: r.pet.name } : null,
  }));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.archivedAt),
      ),
    );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Ongoing medical treatments — medication_started without medication_stopped
// ---------------------------------------------------------------------------

export type OngoingMedication = {
  eventId: string;
  petName: string;
  petPublicToken: string;
  drugName: string;
  frequency: string | null;
  startedAt: Date;
};

export async function fetchOngoingMedications(userId: string): Promise<OngoingMedication[]> {
  const rows = await db.execute<{
    event_id: string;
    pet_name: string;
    pet_public_token: string;
    drug_name: string;
    frequency: string | null;
    started_at: string;
  }>(sql`
    SELECT
      e.id::text AS event_id,
      p.name AS pet_name,
      p.public_token AS pet_public_token,
      COALESCE(e.payload->>'drug_name', 'Medicación') AS drug_name,
      e.payload->>'frequency' AS frequency,
      e.occurred_at::text AS started_at
    FROM pet_events e
    JOIN pets p ON p.id = e.pet_id
    JOIN ownerships o ON o.pet_id = p.id
     AND o.owner_user_id = ${userId}
     AND o.ended_at IS NULL
    WHERE e.event_type = 'medication_started'
      AND NOT EXISTS (
        SELECT 1 FROM pet_events stop
        WHERE stop.event_type = 'medication_stopped'
          AND stop.pet_id = e.pet_id
          AND stop.payload->>'medication_started_event_id' = e.id::text
      )
    ORDER BY e.occurred_at DESC
    LIMIT 20
  `);

  return rows.map((r) => ({
    eventId: r.event_id,
    petName: r.pet_name,
    petPublicToken: r.pet_public_token,
    drugName: r.drug_name,
    frequency: r.frequency,
    startedAt: new Date(r.started_at),
  }));
}

// ---------------------------------------------------------------------------
// Workflows (open + previous)
// ---------------------------------------------------------------------------

export type WorkflowKind =
  | "foster_proposal_pending"
  | "pet_lost"
  | "welfare_report_open"
  | "adoption_application_pending"
  | "custody_transfer_pending"
  | "approval_request_pending"
  | "custody_dispute_open"
  | "bite_observation_open"
  | "dangerous_breed_pending_attestation"
  | "case_generic_open"
  | "foster_proposal_resolved"
  | "welfare_report_closed"
  | "adoption_application_resolved"
  | "approval_request_decided";

export type WorkflowItem = {
  id: string;
  kind: WorkflowKind;
  title: string;
  subtitle: string | null;
  ctaUrl: string;
  since: Date;
  severity: "info" | "warning" | "urgent";
};

async function fetchPendingFosterProposals(userId: string): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: fosterProposals.id,
      publicToken: fosterProposals.publicToken,
      proposedAt: fosterProposals.proposedAt,
      petName: pets.name,
      orgName: organizations.displayName,
    })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .innerJoin(organizations, eq(organizations.id, fosterProposals.organizationId))
    .where(and(eq(fosterProposals.volunteerUserId, userId), eq(fosterProposals.status, "pending")));
  return rows.map((r) => ({
    id: `foster_proposal:${r.id}`,
    kind: "foster_proposal_pending" as const,
    title: `Propuesta de tránsito para ${r.petName}`,
    subtitle: `${r.orgName} espera tu respuesta`,
    ctaUrl: `/cuenta/transitos/propuestas/${r.publicToken}`,
    since: r.proposedAt,
    severity: "warning" as const,
  }));
}

async function fetchLostPets(userId: string): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      updatedAt: pets.updatedAt,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
        eq(pets.status, "lost"),
      ),
    );
  return rows.map((r) => ({
    id: `pet_lost:${r.id}`,
    kind: "pet_lost" as const,
    title: `${r.name} está reportada como perdida`,
    subtitle: "Avisanos cuando aparezca",
    ctaUrl: `/mis-mascotas/${r.publicToken}`,
    since: r.updatedAt,
    severity: "urgent" as const,
  }));
}

async function fetchOpenWelfareReports(userId: string): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: welfareReports.id,
      referenceCode: welfareReports.referenceCode,
      status: welfareReports.status,
      createdAt: welfareReports.createdAt,
    })
    .from(welfareReports)
    .where(and(eq(welfareReports.reporterUserId, userId), ne(welfareReports.status, "closed")));
  return rows.map((r) => ({
    id: `welfare_report:${r.id}`,
    kind: "welfare_report_open" as const,
    title: "Denuncia de bienestar animal",
    subtitle: r.status === "open" ? "En espera de revisión" : "En revisión por autoridad",
    ctaUrl: `/denuncias/codigo/${r.referenceCode}`,
    since: r.createdAt,
    severity: "info" as const,
  }));
}

async function fetchPendingAdoptionApplications(userId: string): Promise<WorkflowItem[]> {
  // Same predicate as /mis-mascotas/postulaciones: submitted by user, no
  // resolution yet, and not finalized to me.
  const rows = await db.execute<{
    application_id: string;
    pet_name: string;
    pet_public_token: string;
    submitted_at: string;
  }>(sql`
    SELECT
      e.id::text AS application_id,
      p.name AS pet_name,
      p.public_token AS pet_public_token,
      e.recorded_at::text AS submitted_at
    FROM pet_events e
    JOIN pets p ON p.id = e.pet_id
    WHERE e.event_type = 'adoption_application_submitted'
      AND e.payload->>'applicant_user_id' = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM pet_events r
        WHERE r.pet_id = e.pet_id
          AND r.event_type = 'adoption_application_resolved'
          AND r.payload->>'application_event_id' = e.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM pet_events f
        WHERE f.pet_id = e.pet_id
          AND f.event_type = 'adoption_finalized'
      )
    ORDER BY e.recorded_at DESC
  `);
  return rows.map((r) => ({
    id: `adoption_application:${r.application_id}`,
    kind: "adoption_application_pending" as const,
    title: `Tu postulación para ${r.pet_name}`,
    subtitle: "Pendiente de revisión del refugio",
    ctaUrl: "/mis-mascotas/postulaciones",
    since: new Date(r.submitted_at),
    severity: "info" as const,
  }));
}

async function fetchPendingCustodyTransfers(userId: string): Promise<WorkflowItem[]> {
  // Pets the user owns where a custody_transfer_proposed exists and no
  // subsequent custody_transferred resolves it.
  const rows = await db.execute<{
    pet_id: string;
    pet_public_token: string;
    pet_name: string;
    proposed_at: string;
  }>(sql`
    SELECT
      p.id::text AS pet_id,
      p.public_token AS pet_public_token,
      p.name AS pet_name,
      e.occurred_at::text AS proposed_at
    FROM pet_events e
    JOIN pets p ON p.id = e.pet_id
    JOIN ownerships o ON o.pet_id = p.id
     AND o.owner_user_id = ${userId}
     AND o.role = 'owner'
     AND o.ended_at IS NULL
    WHERE e.event_type = 'custody_transfer_proposed'
      AND NOT EXISTS (
        SELECT 1 FROM pet_events t
        WHERE t.pet_id = e.pet_id
          AND t.event_type = 'custody_transferred'
          AND t.occurred_at >= e.occurred_at
      )
    ORDER BY e.occurred_at DESC
  `);
  return rows.map((r) => ({
    id: `custody_transfer:${r.pet_id}`,
    kind: "custody_transfer_pending" as const,
    title: `Propuesta de devolución para ${r.pet_name}`,
    subtitle: "Alguien intenta devolverla — confirmá la transferencia",
    ctaUrl: `/mis-mascotas/${r.pet_public_token}/devolucion`,
    since: new Date(r.proposed_at),
    severity: "warning" as const,
  }));
}

async function fetchPendingApprovalRequests(userId: string): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: approvalRequests.id,
      publicToken: approvalRequests.publicToken,
      type: approvalRequests.type,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .where(
      and(eq(approvalRequests.applicantUserId, userId), eq(approvalRequests.status, "pending")),
    );
  return rows.map((r) => ({
    id: `approval_request:${r.id}`,
    kind: "approval_request_pending" as const,
    title: humanizeApprovalRequestType(r.type),
    subtitle: "Esperando aprobación de la autoridad",
    ctaUrl: `/cuenta/aprobaciones/${r.publicToken}`,
    since: r.createdAt,
    severity: "info" as const,
  }));
}

async function fetchOpenCustodyDisputes(userId: string): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: custodyDisputes.id,
      publicToken: custodyDisputes.publicToken,
      petId: custodyDisputes.petId,
      createdAt: custodyDisputes.createdAt,
      petName: pets.name,
    })
    .from(custodyDisputeParties)
    .innerJoin(custodyDisputes, eq(custodyDisputes.id, custodyDisputeParties.disputeId))
    .innerJoin(pets, eq(pets.id, custodyDisputes.petId))
    .where(and(eq(custodyDisputeParties.partyUserId, userId), eq(custodyDisputes.status, "open")));
  return rows.map((r) => ({
    id: `custody_dispute:${r.id}`,
    kind: "custody_dispute_open" as const,
    title: `Disputa de custodia sobre ${r.petName}`,
    subtitle: "Procedimiento en curso ante la autoridad",
    ctaUrl: `/mis-mascotas/${r.petId}`,
    since: r.createdAt,
    severity: "warning" as const,
  }));
}

async function fetchOpenBiteCases(userId: string): Promise<WorkflowItem[]> {
  // Open bite_incident cases (rabies observation) where the affected pet
  // is owned by the user.
  const rows = await db
    .select({
      caseId: cases.id,
      publicCode: cases.publicCode,
      petName: pets.name,
      petPublicToken: pets.publicToken,
      openedAt: cases.openedAt,
    })
    .from(cases)
    .innerJoin(pets, eq(pets.id, cases.primaryPetId))
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(cases.caseKind, "bite_incident"),
        ne(cases.status, "closed"),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    );
  return rows.map((r) => ({
    id: `bite_case:${r.caseId}`,
    kind: "bite_observation_open" as const,
    title: `Observación por mordedura · ${r.petName}`,
    subtitle: `${r.publicCode} · procedimiento en curso`,
    ctaUrl: `/mis-mascotas/${r.petPublicToken}`,
    since: r.openedAt,
    severity: "warning" as const,
  }));
}

async function fetchPendingPppAttestations(userId: string): Promise<WorkflowItem[]> {
  // Pets flagged as potentially dangerous breed where the owner has NOT
  // yet recorded a `dangerous_breed_attested` event. Surfaces as a
  // pending task on /inicio so the owner can comply.
  const rows = await db.execute<{
    pet_id: string;
    pet_name: string;
    pet_public_token: string;
    registered_at: string;
  }>(sql`
    SELECT
      p.id::text AS pet_id,
      p.name AS pet_name,
      p.public_token AS pet_public_token,
      p.created_at::text AS registered_at
    FROM pets p
    JOIN ownerships o ON o.pet_id = p.id
     AND o.owner_user_id = ${userId}
     AND o.role = 'owner'
     AND o.ended_at IS NULL
    WHERE p.potentially_dangerous_breed = TRUE
      AND p.status != 'deceased'
      AND NOT EXISTS (
        SELECT 1 FROM pet_events e
        WHERE e.pet_id = p.id
          AND e.event_type = 'dangerous_breed_attested'
      )
  `);
  return rows.map((r) => ({
    id: `ppp_pending:${r.pet_id}`,
    kind: "dangerous_breed_pending_attestation" as const,
    title: `Atestá la raza de ${r.pet_name}`,
    subtitle: "Tu mascota es PPP (potencialmente peligrosa) — hace falta atestación legal",
    ctaUrl: `/mis-mascotas/${r.pet_public_token}/eventos/atestar-raza-peligrosa`,
    since: new Date(r.registered_at),
    severity: "warning" as const,
  }));
}

// Case kinds with a dedicated fetcher above. The sweep below excludes
// these so we don't show duplicate rows. `adoption_listing` is org-side
// only and intentionally skipped.
const CASE_KINDS_COVERED_BY_KIND_FETCHERS = [
  "foster_placement",
  "lost_pet_episode",
  "welfare_denuncia",
  "adoption_application",
  "custody_dispute",
  "custody_transfer_handshake",
  "bite_incident",
  "adoption_listing",
] as const;

// Catch-all: any open case the user is connected to via pet ownership,
// opener, or applicant role, whose `caseKind` is NOT already covered by a
// dedicated fetcher. Surfaces case kinds like `microchip_remediation` and
// any future kind without requiring a code change to the dashboard.
async function fetchOpenCasesGenericSweep(userId: string): Promise<WorkflowItem[]> {
  const rows = await db
    .selectDistinct({
      caseId: cases.id,
      publicCode: cases.publicCode,
      caseKind: cases.caseKind,
      openedAt: cases.openedAt,
      petName: pets.name,
    })
    .from(cases)
    .leftJoin(pets, eq(pets.id, cases.primaryPetId))
    .leftJoin(
      ownerships,
      and(
        eq(ownerships.petId, cases.primaryPetId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .where(
      and(
        ne(cases.status, "closed"),
        notInArray(cases.caseKind, [...CASE_KINDS_COVERED_BY_KIND_FETCHERS]),
        or(
          eq(ownerships.ownerUserId, userId),
          eq(cases.openedByUserId, userId),
          eq(cases.applicantUserId, userId),
        ),
      ),
    );
  return rows.map((r) => ({
    id: `case_generic:${r.caseId}`,
    kind: "case_generic_open" as const,
    title: r.petName ? `Caso ${r.publicCode} · ${r.petName}` : `Caso ${r.publicCode}`,
    subtitle: caseKindLabelFallback(r.caseKind),
    ctaUrl: `/casos/${r.publicCode}`,
    since: r.openedAt,
    severity: "info" as const,
  }));
}

// Lightweight label lookup that doesn't import lib/case-kinds.ts (avoids
// circular dep risk). Falls back to the raw caseKind if unknown — the
// dashboard still renders, the row is just a bit less polished.
function caseKindLabelFallback(caseKind: string): string {
  switch (caseKind) {
    case "microchip_remediation":
      return "Reemplazo de microchip en curso";
    case "custody_episode":
      return "Episodio de custodia";
    case "outbreak_investigation":
      return "Investigación de brote sanitario";
    case "foster_proposal":
      return "Propuesta de tránsito";
    default:
      return caseKind.replaceAll("_", " ");
  }
}

export async function fetchOpenWorkflows(userId: string): Promise<WorkflowItem[]> {
  const [foster, lost, welfare, adoption, custody, approval, disputes, bite, ppp, generic] =
    await Promise.all([
      fetchPendingFosterProposals(userId),
      fetchLostPets(userId),
      fetchOpenWelfareReports(userId),
      fetchPendingAdoptionApplications(userId),
      fetchPendingCustodyTransfers(userId),
      fetchPendingApprovalRequests(userId),
      fetchOpenCustodyDisputes(userId),
      fetchOpenBiteCases(userId),
      fetchPendingPppAttestations(userId),
      fetchOpenCasesGenericSweep(userId),
    ]);
  // Sort by `since` desc — most recently opened workflow on top.
  return [
    ...foster,
    ...lost,
    ...welfare,
    ...adoption,
    ...custody,
    ...approval,
    ...disputes,
    ...bite,
    ...ppp,
    ...generic,
  ].sort((a, b) => b.since.getTime() - a.since.getTime());
}

// ---------------------------------------------------------------------------
// Previous workflows — last N resolved items across all domains
// ---------------------------------------------------------------------------

async function fetchResolvedFosterProposals(
  userId: string,
  limit: number,
): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: fosterProposals.id,
      publicToken: fosterProposals.publicToken,
      status: fosterProposals.status,
      respondedAt: fosterProposals.respondedAt,
      proposedAt: fosterProposals.proposedAt,
      petName: pets.name,
    })
    .from(fosterProposals)
    .innerJoin(pets, eq(pets.id, fosterProposals.petId))
    .where(
      and(
        eq(fosterProposals.volunteerUserId, userId),
        inArray(fosterProposals.status, ["accepted", "rejected", "cancelled", "expired"]),
      ),
    )
    .orderBy(desc(fosterProposals.respondedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: `foster_proposal_resolved:${r.id}`,
    kind: "foster_proposal_resolved" as const,
    title: `Propuesta de tránsito · ${r.petName}`,
    subtitle: `Estado: ${r.status}`,
    ctaUrl: `/cuenta/transitos/propuestas/${r.publicToken}`,
    since: r.respondedAt ?? r.proposedAt,
    severity: "info" as const,
  }));
}

async function fetchClosedWelfareReports(userId: string, limit: number): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: welfareReports.id,
      referenceCode: welfareReports.referenceCode,
      closedAt: welfareReports.closedAt,
      createdAt: welfareReports.createdAt,
    })
    .from(welfareReports)
    .where(and(eq(welfareReports.reporterUserId, userId), eq(welfareReports.status, "closed")))
    .orderBy(desc(welfareReports.closedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: `welfare_report_closed:${r.id}`,
    kind: "welfare_report_closed" as const,
    title: "Denuncia de bienestar cerrada",
    subtitle: "Resuelta por la autoridad",
    ctaUrl: `/denuncias/codigo/${r.referenceCode}`,
    since: r.closedAt ?? r.createdAt,
    severity: "info" as const,
  }));
}

async function fetchResolvedAdoptionApplications(
  userId: string,
  limit: number,
): Promise<WorkflowItem[]> {
  const rows = await db.execute<{
    application_id: string;
    pet_name: string;
    outcome: string;
    decided_at: string;
  }>(sql`
    SELECT
      s.id::text AS application_id,
      p.name AS pet_name,
      d.payload->>'outcome' AS outcome,
      d.recorded_at::text AS decided_at
    FROM pet_events s
    JOIN pets p ON p.id = s.pet_id
    JOIN pet_events d
      ON d.pet_id = s.pet_id
     AND d.event_type = 'adoption_application_resolved'
     AND d.payload->>'application_event_id' = s.id::text
    WHERE s.event_type = 'adoption_application_submitted'
      AND s.payload->>'applicant_user_id' = ${userId}
    ORDER BY d.recorded_at DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    id: `adoption_application_resolved:${r.application_id}`,
    kind: "adoption_application_resolved" as const,
    title: `Postulación para ${r.pet_name}`,
    subtitle: r.outcome === "approved" ? "Aprobada" : "No avanzó",
    ctaUrl: "/mis-mascotas/postulaciones",
    since: new Date(r.decided_at),
    severity: "info" as const,
  }));
}

async function fetchDecidedApprovalRequests(
  userId: string,
  limit: number,
): Promise<WorkflowItem[]> {
  const rows = await db
    .select({
      id: approvalRequests.id,
      publicToken: approvalRequests.publicToken,
      type: approvalRequests.type,
      status: approvalRequests.status,
      decidedAt: approvalRequests.decidedAt,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.applicantUserId, userId), isNotNull(approvalRequests.decidedAt)))
    .orderBy(desc(approvalRequests.decidedAt))
    .limit(limit);
  return rows.map((r) => ({
    id: `approval_request_decided:${r.id}`,
    kind: "approval_request_decided" as const,
    title: humanizeApprovalRequestType(r.type),
    subtitle: `Resuelta: ${r.status}`,
    ctaUrl: `/cuenta/aprobaciones/${r.publicToken}`,
    since: r.decidedAt ?? r.createdAt,
    severity: "info" as const,
  }));
}

export async function fetchPreviousWorkflows(userId: string, limit = 10): Promise<WorkflowItem[]> {
  const [foster, welfare, adoption, approval] = await Promise.all([
    fetchResolvedFosterProposals(userId, limit),
    fetchClosedWelfareReports(userId, limit),
    fetchResolvedAdoptionApplications(userId, limit),
    fetchDecidedApprovalRequests(userId, limit),
  ]);
  return [...foster, ...welfare, ...adoption, ...approval]
    .sort((a, b) => b.since.getTime() - a.since.getTime())
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Living-pet localities (for the regulations placeholder)
// ---------------------------------------------------------------------------

export async function fetchLivingPetLocalities(
  userId: string,
): Promise<Array<{ province: string; locality: string | null }>> {
  const rows = await db
    .selectDistinct({
      province: pets.jurisdictionProvince,
      locality: pets.jurisdictionLocality,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(ownerships.ownerUserId, userId),
        isNull(ownerships.endedAt),
        ne(pets.status, "deceased"),
        isNotNull(pets.jurisdictionProvince),
      ),
    );
  return rows
    .filter((r): r is { province: string; locality: string | null } => r.province !== null)
    .map((r) => ({ province: r.province, locality: r.locality }));
}

// ---------------------------------------------------------------------------
// Active vaccine reminders
// ---------------------------------------------------------------------------

export type ActiveReminderRow = {
  reminderId: string;
  petId: string;
  petName: string;
  petToken: string;
  petSpecies: string;
  title: string;
  dueAt: Date;
  daysUntilDue: number;
  variant: ReminderVariant;
  isReportable: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Variant priority for sorting: lowest number = highest priority.
const VARIANT_ORDER: Record<ReminderVariant, number> = {
  overdue_critical: 0,
  overdue: 1,
  due_soon: 2,
  upcoming: 3,
  success: 4,
};

async function fetchActiveRemindersBase(
  userId: string,
  petIdFilter?: string,
): Promise<ActiveReminderRow[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 14 * MS_PER_DAY);

  const rows = await db
    .select({
      reminderId: reminders.id,
      petId: pets.id,
      petName: pets.name,
      petToken: pets.publicToken,
      petSpecies: pets.species,
      petLocality: pets.jurisdictionLocality,
      title: reminders.title,
      dueAt: reminders.dueAt,
    })
    .from(reminders)
    .innerJoin(pets, eq(pets.id, reminders.petId))
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.reminderType, "vaccine"),
        isNull(reminders.completedAt),
        or(isNull(reminders.snoozedUntil), lte(reminders.snoozedUntil, now)),
        lte(reminders.dueAt, windowEnd),
        ...(petIdFilter ? [eq(reminders.petId, petIdFilter)] : []),
      ),
    );

  return rows
    .map((r) => {
      const daysUntilDue = Math.round((r.dueAt.getTime() - now.getTime()) / MS_PER_DAY);
      const reportable = isVaccineReportable(r.title, r.petSpecies, r.petLocality ?? "");
      const variant = getReminderVariant(daysUntilDue, reportable);
      return {
        reminderId: r.reminderId,
        petId: r.petId,
        petName: r.petName,
        petToken: r.petToken,
        petSpecies: r.petSpecies,
        title: r.title,
        dueAt: r.dueAt,
        daysUntilDue,
        variant,
        isReportable: reportable,
      };
    })
    .sort((a, b) => {
      const orderDiff = VARIANT_ORDER[a.variant] - VARIANT_ORDER[b.variant];
      if (orderDiff !== 0) return orderDiff;
      return a.dueAt.getTime() - b.dueAt.getTime();
    });
}

/**
 * Active vaccine reminders for an owner. Excludes:
 *  - reminders with completedAt set,
 *  - reminders with snoozedUntil > now,
 *  - reminders whose dueAt is more than 14 days in the future (matches cron window).
 *
 * Ordered by variant priority: overdue_critical → overdue → due_soon → upcoming.
 * Within a variant, oldest dueAt first.
 */
export async function fetchActiveReminders(userId: string): Promise<ActiveReminderRow[]> {
  return fetchActiveRemindersBase(userId);
}

/**
 * Same as fetchActiveReminders but scoped to a single pet. Used by PetReminders.
 */
export async function fetchActiveRemindersForPet(
  userId: string,
  petId: string,
): Promise<ActiveReminderRow[]> {
  return fetchActiveRemindersBase(userId, petId);
}

// ---------------------------------------------------------------------------
// Vaccination history
// ---------------------------------------------------------------------------

export type VaccinationHistoryRow = {
  eventId: string;
  recordedAt: Date;
  vaccineName: string;
  brand?: string | null;
  batch?: string | null;
  administeredBy?: string | null;
  nextDueAt?: Date | null;
  attachmentId?: string | null;
  // Provenance for confidence tier display in the dashboard widget (plan §A.6, 2026-05-22).
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
};

/**
 * Historical vaccination events for a pet, newest first.
 * Returns ALL vacunaciones recorded across the pet's lifetime (no time window).
 * Event type: 'vaccination_administered'.
 * Payload fields: vaccine_name, brand, batch, administered_by, next_due_at.
 */
export async function fetchVaccinationHistory(petId: string): Promise<VaccinationHistoryRow[]> {
  const rows = await db.execute<{
    event_id: string;
    recorded_at: string;
    vaccine_name: string;
    brand: string | null;
    batch: string | null;
    administered_by: string | null;
    next_due_at: string | null;
    attachment_id: string | null;
    author_role: string;
    author_verified: boolean;
    author_organization_id: string | null;
  }>(sql`
    SELECT
      e.id::text           AS event_id,
      e.recorded_at::text  AS recorded_at,
      e.payload->>'vaccine_name'     AS vaccine_name,
      e.payload->>'brand'            AS brand,
      e.payload->>'batch'            AS batch,
      e.payload->>'administered_by'  AS administered_by,
      e.payload->>'next_due_at'      AS next_due_at,
      a.id::text           AS attachment_id,
      e.author_role        AS author_role,
      e.author_verified    AS author_verified,
      e.author_organization_id::text AS author_organization_id
    FROM pet_events e
    LEFT JOIN attachments a ON a.event_id = e.id
    WHERE e.pet_id = ${petId}
      AND e.event_type = 'vaccination_administered'
    ORDER BY e.recorded_at DESC
  `);

  return rows.map((r) => ({
    eventId: r.event_id,
    recordedAt: new Date(r.recorded_at),
    vaccineName: r.vaccine_name ?? "Vacuna",
    brand: r.brand,
    batch: r.batch,
    administeredBy: r.administered_by,
    nextDueAt: r.next_due_at ? new Date(r.next_due_at) : null,
    attachmentId: r.attachment_id,
    authorRole: r.author_role ?? "owner",
    authorVerified: r.author_verified ?? false,
    authorOrganizationId: r.author_organization_id,
  }));
}

// ---------------------------------------------------------------------------
// Notifications by category (for /notificaciones tab filtering — C4)
// ---------------------------------------------------------------------------

export type NotificationCategoryCounts = {
  all: number;
  health: number;
  custody: number;
  adoption: number;
  welfare: number;
  admin: number;
  perdidas: number;
  perdidasUrgent: number;
};

/**
 * Returns per-category counts for non-archived notifications scoped to a user.
 * Notifications without a category are counted in 'all' only.
 */
export async function fetchNotificationCategoryCounts(
  userId: string,
): Promise<NotificationCategoryCounts> {
  const rows = await db.execute<{
    category: string | null;
    severity: string | null;
    n: string;
  }>(sql`
    SELECT category, severity, COUNT(*)::text AS n
    FROM notifications
    WHERE user_id = ${userId}
      AND archived_at IS NULL
    GROUP BY category, severity
  `);

  const counts: NotificationCategoryCounts = {
    all: 0,
    health: 0,
    custody: 0,
    adoption: 0,
    welfare: 0,
    admin: 0,
    perdidas: 0,
    perdidasUrgent: 0,
  };

  for (const r of rows) {
    const n = Number(r.n);
    counts.all += n;
    const cat = r.category;
    if (cat === "health") counts.health += n;
    else if (cat === "custody") counts.custody += n;
    else if (cat === "adoption") counts.adoption += n;
    else if (cat === "welfare") counts.welfare += n;
    else if (cat === "admin") counts.admin += n;
    else if (cat === "perdidas") {
      counts.perdidas += n;
      if (r.severity === "urgent") counts.perdidasUrgent += n;
    }
    // null category → counted in 'all' only (already added above)
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Pet weight history (Chunk J — PetWeightChart data source)
// ---------------------------------------------------------------------------

export type PetWeightSample = {
  date: Date;
  kg: number;
};

/**
 * Latest weight_recorded events for a pet within the last 12 months,
 * ordered ascending by occurredAt. Payload kg is stored as either a string
 * or a number depending on recording path — normalised to number here.
 *
 * Returns an empty array (never throws) when there are no qualifying events
 * or the pet has no weight history.
 */
export async function fetchPetWeightHistory(petId: string): Promise<PetWeightSample[]> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const rows = await db.execute<{ occurred_at: string; kg: string | number }>(sql`
    SELECT e.occurred_at::text AS occurred_at,
           e.payload->>'kg'   AS kg
    FROM pet_events e
    WHERE e.pet_id    = ${petId}
      AND e.event_type = 'weight_recorded'
      AND e.occurred_at >= ${twelveMonthsAgo.toISOString()}
    ORDER BY e.occurred_at ASC
  `);

  const samples: PetWeightSample[] = [];
  for (const r of rows) {
    const raw = r.kg;
    const kg = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
    if (!Number.isFinite(kg)) continue;
    samples.push({ date: new Date(r.occurred_at), kg });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Pet profile v2 — targeted event queries
// ---------------------------------------------------------------------------

/**
 * Whitelisted event types for the pet profile v2 page.
 *
 * These are the only event types fetched for state-computing components
 * (PetCurrentStateSection, AchievementsSection) and for the collapsed
 * PetHealthTimeline preview (recentFive — all types).
 *
 * Guard rule: every event_type consumed by ACHIEVEMENTS_CATALOG computeStatus
 * functions AND by state-computing components MUST be listed here. The test
 * in __tests__/pet-profile-v2-events.test.ts asserts this invariant.
 */
export const PROFILE_V2_TYPED_EVENT_TYPES = [
  // Medication lifecycle — Cuidados próximos state + A4 / estado actual
  "medication_started",
  "medication_stopped",
  // Pregnancy — A4 achievement (live birth): the actual event type is
  // clinical_info_logged with sub_kind='pregnancy'; there are no standalone
  // pregnancy_started / pregnancy_ended event types in the DB.
  "clinical_info_logged",
  // Vaccination — rabies observation label + A-future vaccine state
  "vaccination_administered",
  // Adoption — A2 achievement
  "adoption_finalized",
  // Lost-and-found — A3 achievement
  "status_changed",
  // Weight — Estado actual weight + "hace X" suffix
  "weight_recorded",
  // Sterilization — Estado actual sterilized flag
  "sterilization_performed",
  // Tattoo — Estado actual (R5, fold from tattoo-identifier)
  "tattoo_recorded",
  // Microchip — Estado actual chip line
  "microchip_recorded",
  "microchip_implanted",
] as const;

export type ProfileV2TypedEventType = (typeof PROFILE_V2_TYPED_EVENT_TYPES)[number];

/**
 * Metadata-only projection of a pet event — used by the collapsed
 * PetHealthTimeline header preview. No attachment URLs, no full payload.
 */
export interface PetEventMetadata {
  id: string;
  eventType: string;
  occurredAt: Date;
  /** payload->>'summary' or a short derived label. May be null. */
  summary: string | null;
}

/**
 * Return shape of fetchPetEventsForProfileV2.
 */
export interface PetProfileV2Events {
  /**
   * Whitelisted event types used by state-computing components
   * (achievements, PetCurrentStateSection, PetHealthTimeline state).
   * Ordered ASC by occurred_at.
   */
  typedEvents: (typeof petEvents.$inferSelect)[];
  /**
   * Last 5 events overall, metadata only — no attachment URL signing.
   * Used by the collapsed PetHealthTimeline header preview.
   */
  recentFive: PetEventMetadata[];
}

/**
 * Targeted pet event queries for the v2 pet profile page.
 *
 * Runs two parallel Drizzle queries:
 *   - Query A: whitelisted event types for state computation (no signing)
 *   - Query B: last 5 events, metadata only (no signing)
 *
 * This replaces the legacy "fetch everything + sign all attachments" pattern
 * and reduces profile load from O(N) to O(1) queries.
 */
export async function fetchPetEventsForProfileV2(petId: string): Promise<PetProfileV2Events> {
  const [typedRows, recentRows] = await Promise.all([
    // Query A — whitelisted events for state computation, oldest first.
    db
      .select()
      .from(petEvents)
      .where(
        and(
          eq(petEvents.petId, petId),
          inArray(petEvents.eventType, [...PROFILE_V2_TYPED_EVENT_TYPES]),
        ),
      )
      .orderBy(asc(petEvents.occurredAt)),
    // Query B — last 5 events, metadata only.
    db
      .select({
        id: petEvents.id,
        eventType: petEvents.eventType,
        occurredAt: petEvents.occurredAt,
        payload: petEvents.payload,
      })
      .from(petEvents)
      .where(eq(petEvents.petId, petId))
      .orderBy(desc(petEvents.occurredAt))
      .limit(5),
  ]);

  const recentFive: PetEventMetadata[] = recentRows.map(
    (r: { id: string; eventType: string; occurredAt: Date; payload: unknown }) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>;
      const summary = typeof payload.summary === "string" ? payload.summary : null;
      return {
        id: r.id,
        eventType: r.eventType,
        occurredAt: r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt as string),
        summary,
      };
    },
  );

  return { typedEvents: typedRows, recentFive };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanizeApprovalRequestType(type: string): string {
  switch (type) {
    case "role_upgrade_vet":
      return "Solicitud para verificar tu matrícula veterinaria";
    case "org_create":
      return "Solicitud de creación de organización";
    case "govt_assignment":
      return "Solicitud de asignación gubernamental";
    case "service_offering":
      return "Solicitud de servicio profesional";
    default:
      return `Solicitud de aprobación (${type})`;
  }
}

// ---------------------------------------------------------------------------
// Count helpers for /mis-mascotas "Más acciones" badges
// ---------------------------------------------------------------------------

/**
 * Count the user's adoption applications in pending state.
 *
 * Mirrors the predicate in /mis-mascotas/postulaciones/page.tsx exactly:
 *   - event_type = 'adoption_application_submitted'
 *   - payload->>'applicant_user_id' = userId
 *   - no later 'adoption_application_resolved' for the same application
 *   - no 'adoption_finalized' for this pet WHERE adopter_user_id = userId
 *     (a finalization to a DIFFERENT adopter does NOT remove the application
 *     from the list, so it must not remove it from the count either)
 */
export async function countPendingApplications(userId: string): Promise<number> {
  const [row] = await db.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n
    FROM pet_events e
    WHERE e.event_type = 'adoption_application_submitted'
      AND e.payload->>'applicant_user_id' = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM pet_events r
        WHERE r.pet_id = e.pet_id
          AND r.event_type = 'adoption_application_resolved'
          AND r.payload->>'application_event_id' = e.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM pet_events f
        WHERE f.pet_id = e.pet_id
          AND f.event_type = 'adoption_finalized'
          AND f.payload->>'adopter_user_id' = ${userId}
      )
  `);
  return Number(row?.n ?? 0);
}

/**
 * Count pending ownership transfers awaiting acceptance by this user.
 *
 * Handles both cases:
 *   1. toOwnerId is already resolved (registered user) → match by UUID.
 *   2. toOwnerId is NULL (recipient not yet registered) → match by email.
 *
 * The dual OR mirrors the inbox query in /transferencias and the guard in
 * acceptPetTransferAction / rejectPetTransferAction.
 */
export async function countPendingTransfers(userId: string, email: string): Promise<number> {
  const normalizedEmail = email.toLowerCase();
  // Include the email branch only when the caller has a non-empty email
  // (defense-in-depth: phone-only / OAuth-without-email accounts must not
  // match rows with an empty toOwnerEmail).
  const recipientMatch = normalizedEmail
    ? or(
        eq(petTransfers.toOwnerId, userId),
        and(isNull(petTransfers.toOwnerId), eq(petTransfers.toOwnerEmail, normalizedEmail)),
      )
    : eq(petTransfers.toOwnerId, userId);
  const [row] = await db
    .select({ n: count() })
    .from(petTransfers)
    .where(and(eq(petTransfers.status, "pending"), recipientMatch));
  return row?.n ?? 0;
}
