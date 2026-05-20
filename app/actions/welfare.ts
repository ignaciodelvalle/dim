"use server";

// Server action for animal-cruelty / welfare reports ("denuncia de
// maltrato animal"). Reports can be filed by logged-in users (linked
// via reporter_user_id) or anonymously (reporter_user_id null). After
// the row is inserted, signalWelfareReport is called as the
// integration placeholder — today a no-op.
//
// Anonymous submissions are rate-limited at the action layer using the
// persistent `enforceRateLimit` helper (rate_limit_buckets table). Limits:
// 1 per minute, 3 per hour per IP. Authenticated users skip this gate —
// the auth gate is sufficient.

import {
  auditLog,
  cases,
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
  profiles,
  welfareReportAttachments,
  welfareReports,
} from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { provinceByCode } from "@/lib/ar-provincias";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { signalWelfareReport } from "@/lib/authority";
import { openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { tryResolveCanonicalJurisdiction } from "@/lib/jurisdiction-validation";
import { writePoint } from "@/lib/location";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { generateReferenceCode } from "@/lib/welfare-codes";
import { computeFlagReasons } from "@/lib/welfare-moderation";
import { uploadWelfareEvidence } from "@/lib/welfare-uploads";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type WelfareReportFormState = {
  error: string | null;
};

const KINDS = [
  "abandonment",
  "neglect",
  "physical_abuse",
  "chained",
  "no_shelter",
  "hoarding",
  "dog_fighting",
  "trafficking",
  "other",
];
const SEVERITIES = ["low", "medium", "high", "critical"];
const SUBJECT_KINDS = ["registered_pet", "unowned_animal", "location", "general"];

export async function createWelfareReportAction(
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rate-limit anonymous submissions only. Authenticated users get a free
  // pass because the auth gate is the strong defense; we don't want to
  // accidentally throttle a logged-in advocate filing multiple legit cases
  // (e.g. a refugio reporting on a string of cases from one IP).
  if (!user) {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    try {
      await enforceRateLimit("welfare_anon", ip, {
        maxPerMinute: 1,
        maxPerHour: 3,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          error:
            "Estás enviando demasiadas denuncias seguidas. Esperá unos minutos y volvé a intentar. Si tenés muchos casos legítimos para reportar, considerá crear una cuenta.",
        };
      }
      throw err;
    }
  }

  // Read fields (most optional)
  const kind = String(formData.get("kind") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const locationAddress = String(formData.get("locationAddress") ?? "").trim() || null;
  // Shared LocationFields posts ISO codes for the province; resolve to the
  // canonical display name for storage. The locality is then resolved against
  // the INDEC catalog so the welfare-officer queue and govt scope matching
  // anchor on the same spelling. Both are optional — anonymous denuncias
  // about a general location may legitimately omit them.
  const provinceCodeRaw = String(formData.get("provinceCode") ?? "").trim();
  const localityNameRaw = String(formData.get("localityName") ?? "").trim();
  const provinceName = provinceByCode(provinceCodeRaw)?.name ?? null;
  const jurisdictionCanonical = provinceName
    ? await tryResolveCanonicalJurisdiction({
        rawProvince: provinceName,
        rawLocality: localityNameRaw,
      })
    : null;
  const jurisdictionProvince: string | null = jurisdictionCanonical?.province || provinceName;
  const jurisdictionLocality: string | null =
    jurisdictionCanonical?.locality || localityNameRaw || null;
  const locationLatRaw = String(formData.get("locationLat") ?? "").trim();
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const reporterContactEmail = String(formData.get("reporterContactEmail") ?? "").trim() || null;
  const reporterContactPhone = String(formData.get("reporterContactPhone") ?? "").trim() || null;

  // Validate
  if (!KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (!SEVERITIES.includes(severity)) return { error: "Gravedad inválida." };
  if (!description) return { error: "Falta la descripción de la situación." };
  if (description.length < 20)
    return {
      error: "La descripción debe tener al menos 20 caracteres para poder ser actuable.",
    };
  if (!SUBJECT_KINDS.includes(subjectKind)) return { error: "Sujeto de la denuncia inválido." };

  // Resolve subject pet (when subject_kind === "registered_pet" and a token was provided)
  let subjectPetId: string | null = null;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    const [pet] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, subjectPetToken))
      .limit(1);
    if (!pet) return { error: "Mascota con ese token no encontrada. Verificá el código." };
    subjectPetId = pet.id;
  }

  // For unowned/location/general kinds, require subjectDescription
  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  let locationPoint: { lat: number; lng: number } | null = null;
  if (locationLatRaw || locationLngRaw) {
    // Both lat and lng must be provided together — a half-pair is meaningless
    // and would otherwise surface as a misleading "Longitud inválida" when the
    // missing partner field is what's actually wrong.
    if (!locationLatRaw || !locationLngRaw) {
      return { error: "Se requieren ambas coordenadas: latitud y longitud." };
    }
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Revisá latitud y longitud." };
    }
    locationPoint = { lat, lng };
  }
  const { locationLat, locationLng } = writePoint(locationPoint);

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  // Optional field: observed symptoms on the animal (triggers symptom_observed pet_event).
  const observedSymptoms = String(formData.get("observedSymptoms") ?? "").trim() || null;

  // Collect attachment files (multiple entries under the same key)
  const attachmentEntries = formData.getAll("attachment");
  const files = attachmentEntries
    .filter((e): e is File => e instanceof File)
    .filter((f) => f.size > 0);

  type NewWelfareReport = typeof welfareReports.$inferInsert;

  // Determine the reporter's role relative to the subject pet (used in pet_event payload).
  // Only relevant when subjectPetId is set. We'll check ownership after resolving the pet.
  let isOwnerOfSubjectPet = false;
  if (subjectPetId && user) {
    const [ownershipRow] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, subjectPetId),
          eq(ownerships.ownerUserId, user.id),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    isOwnerOfSubjectPet = !!ownershipRow;
  }

  const reporterRole = isOwnerOfSubjectPet ? "owner" : "witness";
  const authorRole = isOwnerOfSubjectPet ? "owner" : "scanner";

  // Generate reference code with retry-on-collision (unique constraint violation).
  let referenceCode = generateReferenceCode();
  let attempts = 0;
  let insertedId: string | null = null;

  // Welfare report + welfare attachment rows + pet_event rows all go in ONE transaction.
  // Attachment *file* uploads happen outside the tx (S3-style, not transactional).
  // Upload files first; if tx fails we clean them up.
  let uploadResult: Awaited<ReturnType<typeof uploadWelfareEvidence>> | null = null;
  if (files.length > 0) {
    // We need an ID for the welfare_report to build the storage path — but we don't have it yet.
    // We pre-generate a UUID for the report and use that in the path.
    // Drizzle will honour it via explicit insert.
    // Instead, we do the upload after the tx succeeds (same as before), keeping the report row ID.
    // So: insert report row first (outside tx or in first step), then upload, then attachment rows.
  }

  while (attempts < 5) {
    try {
      const [row] = await db
        .insert(welfareReports)
        .values({
          reporterUserId: user?.id ?? null,
          reporterContactEmail,
          reporterContactPhone,
          kind: kind as NewWelfareReport["kind"],
          severity: severity as NewWelfareReport["severity"],
          description,
          subjectKind: subjectKind as NewWelfareReport["subjectKind"],
          subjectPetId,
          subjectDescription,
          locationAddress,
          jurisdictionProvince,
          jurisdictionLocality,
          locationLat,
          locationLng,
          occurredAt,
          referenceCode,
        })
        .returning({ id: welfareReports.id, referenceCode: welfareReports.referenceCode });
      insertedId = row.id;
      referenceCode = row.referenceCode;
      break;
    } catch (err) {
      // Detect unique-violation on reference_code and retry with a new code.
      const pgCode = (err as { code?: string }).code;
      if (pgCode === "23505" && attempts < 4) {
        referenceCode = generateReferenceCode();
        attempts++;
        continue;
      }
      return {
        error: `No se pudo registrar la denuncia: ${err instanceof Error ? err.message : "error desconocido"}`,
      };
    }
  }
  if (!insertedId) {
    return { error: "No se pudo generar un código único para la denuncia. Probá de nuevo." };
  }

  // Upload evidence files (if any). On upload error we return early — the
  // report row stays; this is acceptable. The user can re-submit or contact
  // support. We do NOT roll back the report itself.
  if (files.length > 0) {
    uploadResult = await uploadWelfareEvidence(supabase, insertedId, files);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  // Attachment rows + case open + pet_event emissions go in a single tx.
  // The welfare_denuncia case row is created here (cases system, Fase D1)
  // so the welfare_report → case linkage and the bridge events all land
  // atomically — partial state is impossible.
  try {
    await db.transaction(async (tx) => {
      // Welfare report attachment rows.
      if (uploadResult && uploadResult.uploaded.length > 0) {
        await tx.insert(welfareReportAttachments).values(
          uploadResult.uploaded.map((u) => ({
            welfareReportId: insertedId as string,
            uploadedByUserId: user?.id ?? null,
            storagePath: u.storagePath,
            mimeType: u.mimeType,
            fileSize: u.fileSize,
            originalFilename: u.originalFilename,
          })),
        );
      }

      // Cases system: open the welfare_denuncia case atomically. The
      // primary subject mirrors the welfare_report.subject_kind. Location
      // subjects without coords fall back to 'general' to keep the
      // cases_subject_location_consistency CHECK happy.
      const subjectIsLocationWithCoords =
        subjectKind === "location" && locationLat !== null && locationLng !== null;
      const primarySubjectKind =
        subjectKind === "registered_pet" && subjectPetId
          ? "registered_pet"
          : subjectKind === "unowned_animal"
            ? "unowned_animal"
            : subjectIsLocationWithCoords
              ? "location"
              : "general";

      const caseRow = await openCase(
        {
          kind: "welfare_denuncia",
          primarySubjectKind,
          primaryPetId: primarySubjectKind === "registered_pet" ? subjectPetId : null,
          primaryLocationLat: subjectIsLocationWithCoords ? locationLat : null,
          primaryLocationLng: subjectIsLocationWithCoords ? locationLng : null,
          jurisdictionProvince,
          jurisdictionLocality,
          openedByUserId: user?.id ?? null,
          openedReason: `Welfare denuncia ${referenceCode} — kind=${kind}, severity=${severity}`,
          welfareReportId: insertedId as string,
        },
        tx,
      );
      await tx
        .update(welfareReports)
        .set({ caseId: caseRow.id })
        .where(eq(welfareReports.id, insertedId as string));

      // Pet-event bridge: only when the subject is a registered pet with a resolved ID.
      if (subjectKind === "registered_pet" && subjectPetId) {
        const eventOccurredAt = occurredAt ?? new Date();
        const now = new Date();

        const MALTREATMENT_KINDS = new Set([
          "physical_abuse",
          "neglect",
          "chained",
          "no_shelter",
          "hoarding",
          "dog_fighting",
          "trafficking",
        ]);

        if (kind === "abandonment") {
          const abandonmentEventPayload = validateEventPayload("abandonment_reported", {
            welfare_report_id: insertedId,
            reporter_role: reporterRole,
            description,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "abandonment_reported",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user?.id ?? null,
            authorRole,
            payload: abandonmentEventPayload,
            // Mirror coords from the welfare report so the pet's event detail
            // page can render the LocationMap without joining welfare_reports.
            locationLat,
            locationLng,
            caseId: caseRow.id,
          });
        } else if (MALTREATMENT_KINDS.has(kind)) {
          const maltreatmentEventPayload = validateEventPayload("maltreatment_reported", {
            welfare_report_id: insertedId,
            reporter_role: reporterRole,
            description,
            severity,
            kind,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "maltreatment_reported",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user?.id ?? null,
            authorRole,
            payload: maltreatmentEventPayload,
            locationLat,
            locationLng,
            caseId: caseRow.id,
          });
        }

        if (observedSymptoms) {
          // Updated in surveillance Fase 2: new shape with source discriminator.
          // Welfare-report symptoms deliberately do NOT run the matcher (different
          // reporting context — see plan Paso 2.5 and spec §5).
          const symptomEventPayload = validateEventPayload("symptom_observed", {
            source: "welfare_report",
            welfare_report_id: insertedId,
            reporter_role: reporterRole,
            free_text: observedSymptoms,
            matched_symptom_codes: [],
            alerted_disease_codes: [],
            severity_self_assessed: null,
            onset_at: null,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "symptom_observed",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user?.id ?? null,
            authorRole,
            payload: symptomEventPayload,
            locationLat,
            locationLng,
            caseId: caseRow.id,
          });
        }
      }
    });
  } catch {
    // Attachment rows or pet_event rows failed. Clean up uploaded files.
    if (uploadResult?.uploadedPaths?.length) {
      await supabase.storage
        .from("welfare-evidence")
        .remove(uploadResult.uploadedPaths)
        .catch(() => {});
    }
    return {
      error:
        "La denuncia se guardó pero no se pudieron registrar los archivos adjuntos. Intentá de nuevo.",
    };
  }

  // Auto-flag anonymous denuncias against the moderation heuristics. Logged-in
  // submissions skip this — identity is a strong-enough signal that
  // legitimate volume from advocates doesn't need triage friction. Flagged
  // rows hide from /gob/maltrato until an admin resolves them at
  // /admin/moderacion.
  if (!user) {
    try {
      const attachmentCount = uploadResult?.uploaded?.length ?? 0;
      const flagReasons = await computeFlagReasons({
        reportId: insertedId,
        description,
        severity,
        subjectKind,
        attachmentCount,
      });
      if (flagReasons.length > 0) {
        await db
          .update(welfareReports)
          .set({ flaggedAt: new Date(), flagReasons })
          .where(eq(welfareReports.id, insertedId));
      }
    } catch (err) {
      // Auto-flagging is best-effort. A failure here MUST NOT roll back the
      // denuncia itself — the case still belongs in the system, just enters
      // the triage queue without the pre-filter. Log and move on.
      console.error("[welfare] auto-flag heuristics failed (non-fatal):", err);
    }
  }

  await signalWelfareReport({
    reportId: insertedId,
    kind,
    severity,
    jurisdictionProvince,
    jurisdictionLocality,
    hasContact: Boolean(reporterContactEmail || reporterContactPhone),
  });

  // Authenticated users go to mis denuncias. Anonymous reporters go to
  // their by-code detail page with a "nueva" banner — that page is the
  // ONLY way they will be able to reach this denuncia again.
  redirect(user ? "/denuncias/mias" : `/denuncias/codigo/${referenceCode}?nueva=1`);
}

// ---------------------------------------------------------------------------
// Org-side welfare report (spec 2026-05-19-org-abuse-investigation)
// ---------------------------------------------------------------------------
//
// Capability `welfare.report` is implicit: any active member with role
// in {admin, coordinator, member, vet_individual} of a *verified* org
// holds it. volunteer + foster do NOT (OA11) — institutional
// accountability lives at the verified-member level, not below.
//
// Differences vs. the public flow (createWelfareReportAction):
//   - reporter_organization_id populated
//   - severity forced to 'critical' (OA2 — professional reporters
//     calibrate info quality via their role; default safe)
//   - skips moderation auto-flag (OA7 — org is accountable)
//   - notif urgent inmediato a govt scope + admin (OA4)
//   - multi-source escalation when ≥2 orgs report the same subject (OA9)

const ORG_WELFARE_ROLES = new Set(["admin", "coordinator", "member", "vet_individual"]);

export async function createOrgWelfareReportAction(
  orgToken: string,
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const { user } = await requireUserOrRedirect();

  // Verified-org membership check: the user must hold a non-leftAt
  // membership in the org identified by `orgToken`, with one of the
  // welfare-report roles, AND the org must be verified.
  const [orgRow] = await db
    .select({
      orgId: organizations.id,
      orgDisplayName: organizations.displayName,
      orgVerified: organizations.verified,
      memberRole: organizationMemberships.role,
    })
    .from(organizations)
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.publicToken, orgToken),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);
  if (!orgRow) return { error: "No sos miembro activo de esta organización." };
  if (!orgRow.orgVerified) {
    return { error: "Tu organización todavía no está verificada por MiMAR." };
  }
  if (!ORG_WELFARE_ROLES.has(orgRow.memberRole)) {
    return {
      error:
        "Tu rol dentro de la organización no habilita el reporte de maltrato. Pediselo a un coordinador.",
    };
  }

  const kind = String(formData.get("kind") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const locationAddress = String(formData.get("locationAddress") ?? "").trim() || null;
  const provinceCodeRaw = String(formData.get("provinceCode") ?? "").trim();
  const localityNameRaw = String(formData.get("localityName") ?? "").trim();
  const provinceName = provinceByCode(provinceCodeRaw)?.name ?? null;
  const jurisdictionCanonical = provinceName
    ? await tryResolveCanonicalJurisdiction({
        rawProvince: provinceName,
        rawLocality: localityNameRaw,
      })
    : null;
  const jurisdictionProvince: string | null = jurisdictionCanonical?.province || provinceName;
  const jurisdictionLocality: string | null =
    jurisdictionCanonical?.locality || localityNameRaw || null;
  const locationLatRaw = String(formData.get("locationLat") ?? "").trim();
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const observedSymptoms = String(formData.get("observedSymptoms") ?? "").trim() || null;

  if (!KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (description.length < 100) {
    return {
      error:
        "La descripción profesional debe tener al menos 100 caracteres con contexto operativo.",
    };
  }
  if (!SUBJECT_KINDS.includes(subjectKind)) return { error: "Sujeto de la denuncia inválido." };

  // Severity is auto-overridden to 'critical' per spec OA2. The form
  // may post a value but the server is authoritative.
  const severity = "critical" as const;

  let subjectPetId: string | null = null;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    const [pet] = await db
      .select({ id: pets.id })
      .from(pets)
      .where(eq(pets.publicToken, subjectPetToken))
      .limit(1);
    if (!pet) return { error: "Mascota con ese token no encontrada. Verificá el código." };
    subjectPetId = pet.id;
  }

  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  let locationPoint: { lat: number; lng: number } | null = null;
  if (locationLatRaw || locationLngRaw) {
    if (!locationLatRaw || !locationLngRaw) {
      return { error: "Se requieren ambas coordenadas: latitud y longitud." };
    }
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Revisá latitud y longitud." };
    }
    locationPoint = { lat, lng };
  }
  const { locationLat, locationLng } = writePoint(locationPoint);

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  const attachmentEntries = formData.getAll("attachment");
  const files = attachmentEntries
    .filter((e): e is File => e instanceof File)
    .filter((f) => f.size > 0);
  if (files.length === 0) {
    return { error: "Un reporte profesional requiere al menos un adjunto de evidencia." };
  }

  // Insert + retry on referenceCode collision.
  let referenceCode = generateReferenceCode();
  let attempts = 0;
  let insertedId: string | null = null;
  type NewWelfareReport = typeof welfareReports.$inferInsert;
  while (attempts < 5) {
    try {
      const [row] = await db
        .insert(welfareReports)
        .values({
          reporterUserId: user.id,
          reporterOrganizationId: orgRow.orgId,
          kind: kind as NewWelfareReport["kind"],
          severity,
          description,
          subjectKind: subjectKind as NewWelfareReport["subjectKind"],
          subjectPetId,
          subjectDescription,
          locationAddress,
          jurisdictionProvince,
          jurisdictionLocality,
          locationLat,
          locationLng,
          occurredAt,
          referenceCode,
        })
        .returning({ id: welfareReports.id, referenceCode: welfareReports.referenceCode });
      insertedId = row.id;
      referenceCode = row.referenceCode;
      break;
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      if (pgCode === "23505" && attempts < 4) {
        referenceCode = generateReferenceCode();
        attempts++;
        continue;
      }
      return {
        error: `No se pudo registrar la denuncia: ${err instanceof Error ? err.message : "error desconocido"}`,
      };
    }
  }
  if (!insertedId) {
    return { error: "No se pudo generar un código único para la denuncia. Probá de nuevo." };
  }

  // Upload evidence files before the case-open tx.
  const supabase = await createClient();
  const uploadResult = await uploadWelfareEvidence(supabase, insertedId, files);
  if (uploadResult.error) return { error: uploadResult.error };

  // Atomic: attachments + open case + bridge events + welfare_reports.case_id +
  // multi-source escalation + audit log.
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];
  let createdCaseId: string | null = null;
  try {
    await db.transaction(async (tx) => {
      if (uploadResult.uploaded.length > 0) {
        await tx.insert(welfareReportAttachments).values(
          uploadResult.uploaded.map((u) => ({
            welfareReportId: insertedId as string,
            uploadedByUserId: user.id,
            storagePath: u.storagePath,
            mimeType: u.mimeType,
            fileSize: u.fileSize,
            originalFilename: u.originalFilename,
          })),
        );
      }

      const subjectIsLocationWithCoords =
        subjectKind === "location" && locationLat !== null && locationLng !== null;
      const primarySubjectKind =
        subjectKind === "registered_pet" && subjectPetId
          ? "registered_pet"
          : subjectKind === "unowned_animal"
            ? "unowned_animal"
            : subjectIsLocationWithCoords
              ? "location"
              : "general";

      const caseRow = await openCase(
        {
          kind: "welfare_denuncia",
          primarySubjectKind,
          primaryPetId: primarySubjectKind === "registered_pet" ? subjectPetId : null,
          primaryLocationLat: subjectIsLocationWithCoords ? locationLat : null,
          primaryLocationLng: subjectIsLocationWithCoords ? locationLng : null,
          jurisdictionProvince,
          jurisdictionLocality,
          openedByUserId: user.id,
          openedByOrganizationId: orgRow.orgId,
          openedReason: `auto: org-side welfare report by ${orgRow.orgDisplayName} (${referenceCode})`,
          welfareReportId: insertedId as string,
        },
        tx,
      );
      createdCaseId = caseRow.id;

      await tx
        .update(welfareReports)
        .set({ caseId: caseRow.id })
        .where(eq(welfareReports.id, insertedId as string));

      // Bridge events for registered pets (mirrors createWelfareReportAction).
      if (subjectKind === "registered_pet" && subjectPetId) {
        const eventOccurredAt = occurredAt ?? new Date();
        const now = new Date();
        const MALTREATMENT_KINDS = new Set([
          "physical_abuse",
          "neglect",
          "chained",
          "no_shelter",
          "hoarding",
          "dog_fighting",
          "trafficking",
        ]);

        if (kind === "abandonment") {
          const abandonmentPayload = validateEventPayload("abandonment_reported", {
            welfare_report_id: insertedId,
            reporter_role: "witness",
            description,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "abandonment_reported",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "shelter",
            authorOrganizationId: orgRow.orgId,
            payload: abandonmentPayload,
            locationLat,
            locationLng,
            caseId: caseRow.id,
          });
        } else if (MALTREATMENT_KINDS.has(kind)) {
          const maltreatmentPayload = validateEventPayload("maltreatment_reported", {
            welfare_report_id: insertedId,
            reporter_role: "witness",
            description,
            severity,
            kind,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "maltreatment_reported",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "shelter",
            authorOrganizationId: orgRow.orgId,
            payload: maltreatmentPayload,
            locationLat,
            locationLng,
            caseId: caseRow.id,
          });
        }

        if (observedSymptoms) {
          const symptomPayload = validateEventPayload("symptom_observed", {
            source: "welfare_report",
            welfare_report_id: insertedId,
            reporter_role: "witness",
            free_text: observedSymptoms,
            matched_symptom_codes: [],
            alerted_disease_codes: [],
            severity_self_assessed: null,
            onset_at: null,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "symptom_observed",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user.id,
            authorRole: "shelter",
            authorOrganizationId: orgRow.orgId,
            payload: symptomPayload,
            locationLat,
            locationLng,
            caseId: caseRow.id,
          });
        }

        // Multi-source escalation (OA9): if another welfare_denuncia
        // case for the same pet is still open, attach a system note +
        // notify the original case's authorities so the corroboration
        // is visible.
        const otherOpen = await tx
          .select({ id: cases.id, publicCode: cases.publicCode })
          .from(cases)
          .where(
            and(
              eq(cases.primaryPetId, subjectPetId),
              eq(cases.caseKind, "welfare_denuncia"),
              inArray(cases.status, ["open", "escalated"]),
              ne(cases.id, caseRow.id),
            ),
          );
        if (otherOpen.length > 0) {
          const original = otherOpen[0];
          const notePayload = validateEventPayload("note_added", {
            category: "system",
            text: `Otra organización (${orgRow.orgDisplayName}) reportó un caso adicional sobre esta mascota. Ver caso ${caseRow.publicCode}. Múltiples fuentes elevan la prioridad.`,
          });
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "note_added",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: null,
            authorRole: "system",
            payload: notePayload,
            caseId: original.id,
          });
        }
      }

      // Notif urgent inmediata al govt scope + admin (OA4).
      const govtRecipients =
        jurisdictionProvince && jurisdictionLocality
          ? await findAuthoritiesForJurisdiction({
              province: jurisdictionProvince,
              locality: jurisdictionLocality,
            })
          : [];
      const adminRecipients = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.role, "admin"),
            eq(profiles.accountType, "institutional"),
            isNull(profiles.deactivatedAt),
          ),
        );
      const recipientSet = new Set<string>([
        ...govtRecipients,
        ...adminRecipients.map((a) => a.id),
      ]);
      if (recipientSet.size > 0) {
        for (const userId of recipientSet) {
          pendingNotifications.push({
            userId,
            notificationType: "welfare_org_side_critical_received" as const,
            severity: "urgent" as const,
            title: `Denuncia crítica de ${orgRow.orgDisplayName}`,
            body: `${orgRow.orgDisplayName} reportó un caso de maltrato${jurisdictionLocality ? ` en ${jurisdictionLocality}` : ""}. Reporte profesional con severidad crítica.`,
            ctaLabel: "Ver caso",
            ctaUrl: `/casos/${caseRow.publicCode}`,
            relatedCaseId: caseRow.id,
            relatedPetId: subjectPetId,
          });
        }
      }

      // Confirmation to the reporter.
      pendingNotifications.push({
        userId: user.id,
        notificationType: "welfare_org_side_confirmed_reporter" as const,
        severity: "info" as const,
        title: "Recibimos tu denuncia profesional",
        body: `La denuncia ${referenceCode} entró al sistema con prioridad crítica. Las autoridades en jurisdicción ya fueron notificadas.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${caseRow.publicCode}`,
        relatedCaseId: caseRow.id,
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "welfare_report_submitted_by_org",
        payload: {
          organizationId: orgRow.orgId,
          organizationName: orgRow.orgDisplayName,
          welfareReportId: insertedId,
          caseId: caseRow.id,
          subjectKind,
        },
      });
    });
  } catch (err) {
    if (uploadResult.uploadedPaths.length > 0) {
      await supabase.storage
        .from("welfare-evidence")
        .remove(uploadResult.uploadedPaths)
        .catch(() => {});
    }
    return {
      error: `No se pudo registrar la denuncia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  // Best-effort signal (legacy hook).
  await signalWelfareReport({
    reportId: insertedId,
    kind,
    severity,
    jurisdictionProvince,
    jurisdictionLocality,
    hasContact: true,
  });

  void createdCaseId;
  redirect(`/org/${orgToken}/maltrato/recibidos`);
}
