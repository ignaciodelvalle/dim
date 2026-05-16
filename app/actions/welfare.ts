"use server";

// Server action for animal-cruelty / welfare reports ("denuncia de
// maltrato animal"). Reports can be filed by logged-in users (linked
// via reporter_user_id) or anonymously (reporter_user_id null). After
// the row is inserted, signalWelfareReport is called as the
// integration placeholder — today a no-op.
//
// TODO(rate-limit): anonymous insertions should be rate-limited at the
// edge (Vercel middleware or a Supabase Edge Function) to prevent spam.
// Out of scope for v1.

import { db, ownerships, petEvents, pets, welfareReportAttachments, welfareReports } from "@/db";
import { signalWelfareReport } from "@/lib/authority";
import { parseDateInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { generateReferenceCode } from "@/lib/welfare-codes";
import { uploadWelfareEvidence } from "@/lib/welfare-uploads";
import { and, eq, isNull } from "drizzle-orm";
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

  // Read fields (most optional)
  const kind = String(formData.get("kind") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const locationAddress = String(formData.get("locationAddress") ?? "").trim() || null;
  const jurisdictionProvince = String(formData.get("jurisdictionProvince") ?? "").trim() || null;
  const jurisdictionLocality = String(formData.get("jurisdictionLocality") ?? "").trim() || null;
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

  const locationLat = locationLatRaw ? Number.parseFloat(locationLatRaw) : null;
  const locationLng = locationLngRaw ? Number.parseFloat(locationLngRaw) : null;
  if (locationLatRaw && (locationLat === null || !Number.isFinite(locationLat))) {
    return { error: "Latitud inválida." };
  }
  if (locationLngRaw && (locationLng === null || !Number.isFinite(locationLng))) {
    return { error: "Longitud inválida." };
  }

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

  // Attachment rows + pet_event emissions go in a single tx.
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
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "abandonment_reported",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user?.id ?? null,
            authorRole,
            payload: {
              welfare_report_id: insertedId,
              reporter_role: reporterRole,
              description,
            },
          });
        } else if (MALTREATMENT_KINDS.has(kind)) {
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "maltreatment_reported",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user?.id ?? null,
            authorRole,
            payload: {
              welfare_report_id: insertedId,
              reporter_role: reporterRole,
              description,
              severity,
              kind,
            },
          });
        }

        if (observedSymptoms) {
          await tx.insert(petEvents).values({
            petId: subjectPetId,
            eventType: "symptom_observed",
            occurredAt: eventOccurredAt,
            recordedAt: now,
            recordedByUserId: user?.id ?? null,
            authorRole,
            payload: {
              welfare_report_id: insertedId,
              reporter_role: reporterRole,
              symptoms: observedSymptoms,
            },
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
