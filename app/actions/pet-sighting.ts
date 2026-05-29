"use server";

// Anonymous "I saw the pet near here" report — Tier 1 (lost mode) only.
// Trilogy unification handoff §3 PR-025.
//
// Distinct from notifyOwnerOfFoundPetAction: the finder does NOT have the
// pet, they just spotted it. We capture lat/lng + an optional description
// and emit:
//   - pet_event note_added (category=otro, kind="sighting", raw description
//     text) so the owner sees the sighting in the timeline and sightingsCount
//     can be derived from payload->>'kind' = 'sighting'.
//   - notification (severity=urgent) to the owner.
//
// Rate-limited by (IP, publicToken) per 5 minutes to mitigate abuse. The
// matching limiter for the "I found her" form lives in app/actions/public.ts.
//
// P0d additions: optional photo upload, finderName, finderContact.
// Photo is uploaded to the "event-attachments" bucket via uploadAttachmentIfPresent.
// A failed upload is non-fatal — the sighting is still recorded without the photo.
// TODO(privacy): strip EXIF GPS from finder photos before upload (no image-processing
// dep in this repo — sharp/jimp absent from package.json; add when privacy reqs land).

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { cases, db, notifications, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { makeMemoryRateLimiter } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadAttachmentIfPresent } from "@/lib/uploads";

export type SightingActionState = {
  ok: boolean;
  error: string | null;
  /** Non-fatal warning shown when photo upload failed but sighting was saved. */
  warning?: string | null;
};

const sightingLimiter = makeMemoryRateLimiter(5 * 60 * 1000);

// @no-auth-required: anonymous sighting submission via /p/[token]/sighting.
// Rate-limited by (IP + publicToken) per 5 minutes.
export async function reportPetSightingAction(
  publicToken: string,
  _previous: SightingActionState,
  formData: FormData,
): Promise<SightingActionState> {
  if (!publicToken) return { ok: false, error: "Token de mascota inválido." };

  const reqHeaders = await headers();
  const forwardedFor = reqHeaders.get("x-forwarded-for");
  const callerIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  const rateLimitKey = `sighting:${callerIp}:${publicToken}`;
  const rateResult = sightingLimiter.check(rateLimitKey);
  if (!rateResult.allowed) {
    return {
      ok: false,
      error: "Ya enviaste un aviso hace poco. Probá de nuevo en unos minutos.",
    };
  }

  const latRaw = String(formData.get("locationLat") ?? "").trim();
  const lngRaw = String(formData.get("locationLng") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sightedAtIso = String(formData.get("sightedAt") ?? "").trim();

  // P0d: optional finder identity + photo.
  const rawFinderName = String(formData.get("finderName") ?? "").trim();
  const rawFinderContact = String(formData.get("finderContact") ?? "").trim();
  const finderName = rawFinderName ? rawFinderName.slice(0, 80) : null;
  const finderContact = rawFinderContact ? rawFinderContact.slice(0, 120) : null;
  const photoFile = formData.get("photo") instanceof File
    ? (formData.get("photo") as File)
    : null;

  const lat = latRaw ? Number.parseFloat(latRaw) : Number.NaN;
  const lng = lngRaw ? Number.parseFloat(lngRaw) : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Marcá un punto en el mapa para indicar dónde la viste." };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "La ubicación está fuera de rango." };
  }

  const [pet] = await db
    .select({ id: pets.id, name: pets.name, status: pets.status })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };
  if (pet.status !== "lost") {
    // Only meaningful while the pet is in lost mode.
    return { ok: false, error: "Esta mascota no está marcada como perdida." };
  }

  const [owner] = await db
    .select({ userId: ownerships.ownerUserId })
    .from(ownerships)
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);
  if (!owner?.userId) return { ok: false, error: "No se encontró un dueño activo." };

  const safeDescription = description.slice(0, 500);
  const occurredAt = sightedAtIso ? new Date(sightedAtIso) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return { ok: false, error: "Fecha y hora del avistaje inválida." };
  }

  const noteText = safeDescription
    ? safeDescription
    : `Alguien reportó haber visto a ${pet.name} cerca de este punto.`;

  // P0d: upload photo if present. Non-fatal — sighting is recorded even when upload fails.
  // Uses the service-role admin client because this action is anonymous (@no-auth-required)
  // and the event-attachments bucket's RLS grants INSERT only to authenticated roles.
  // The admin client bypasses RLS so anonymous finders can attach photos.
  let photoStoragePath: string | null = null;
  let photoWarning: string | null = null;
  if (photoFile && photoFile.size > 0) {
    const supabase = createAdminClient();
    const uploadResult = await uploadAttachmentIfPresent(supabase, photoFile, "event-attachments");
    if (uploadResult.error) {
      console.warn("[pet-sighting] Photo upload failed (non-fatal):", uploadResult.error);
      photoWarning = "No se pudo subir la foto, pero el avistaje fue registrado igual.";
    } else {
      photoStoragePath = uploadResult.uploadedPath;
    }
  }

  const payload = validateEventPayload("note_added", {
    category: "otro" as const,
    text: noteText,
    kind: "sighting" as const,
    finderName: finderName ?? undefined,
    finderContact: finderContact ?? undefined,
    photoStoragePath: photoStoragePath ?? undefined,
  });

  // Resolve the open lost_pet_episode case so the sighting event is associated
  // with it. This scopes sightingsCount by caseId and prevents counting sightings
  // from a prior lost episode if the pet was lost→found→lost again.
  const [openCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, pet.id),
        eq(cases.caseKind, "lost_pet_episode"),
        eq(cases.status, "open"),
      ),
    )
    .limit(1);

  await db.insert(petEvents).values({
    petId: pet.id,
    eventType: "note_added",
    occurredAt,
    recordedAt: new Date(),
    recordedByUserId: null,
    authorRole: "scanner",
    authorVerified: false,
    payload,
    locationLat: lat.toString(),
    locationLng: lng.toString(),
    // Associate with the open case when available (pet is in active lost mode).
    // caseId stays null if no open case exists (guard above already blocked
    // non-lost pets, but we keep the null path for safety).
    caseId: openCase?.id ?? null,
  });

  const bodyParts = [
    `Alguien reportó haber visto a ${pet.name} cerca de un punto.`,
    safeDescription ? `Mensaje: "${safeDescription}".` : null,
    finderName && finderContact
      ? `📞 ${finderName} dejó ${finderContact}.`
      : finderContact
        ? `📞 Contacto: ${finderContact}.`
        : finderName
          ? `Reportado por ${finderName}.`
          : null,
    "Mirá el detalle en su perfil.",
  ].filter(Boolean);

  await db.insert(notifications).values({
    userId: owner.userId,
    notificationType: "pet_found_report",
    title: `Avistaje de ${pet.name}`,
    body: bodyParts.join(" "),
    severity: "urgent",
    relatedPetId: pet.id,
    ctaLabel: "Ver mascota",
    ctaUrl: `/mis-mascotas/${publicToken}/eventos`,
  });

  return { ok: true, error: null, warning: photoWarning };
}
