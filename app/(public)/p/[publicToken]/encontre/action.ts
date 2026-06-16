"use server";

// Anonymous "I physically have the pet, come get it" action — Tier 1 (lost mode).
// Heavier sibling of /sighting: the finder claims physical custody of the pet
// and the owner needs to arrange pickup.
//
// Emits:
//   - pet_events row: note_added, kind="finder_in_possession", full payload
//   - notifications row: pet_in_possession, severity=urgent, category=perdidas
//
// Rate-limited by (IP, publicToken) per 5 minutes. Idempotency guard skips
// double-insert when (petId, finderContact) already has a finder_in_possession
// event within the last 5 minutes.
//
// Photo upload uses service-role admin client (anonymous action, bucket RLS
// requires authenticated; same pattern as /sighting P0d).
// P0g: EXIF metadata (including GPS) is stripped from finder photos via sharp
// before upload. Non-fatal: falls back to original if sharp throws.
// P0g: photo also inserted into the attachments table (linked to the event) so
// the historial / eventos / EventTimeline surfaces can render it for free.

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";

import { attachments, cases, db, notifications, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseLocationFromFormData } from "@/lib/location-value";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";

export type FinderInPossessionState = {
  ok: boolean;
  error: string | null;
  /** Non-fatal warning shown when photo upload failed but event was saved. */
  warning?: string | null;
};

// @no-auth-required: anonymous finder submits via /p/[token]/encontre.
// Rate-limited by (IP + publicToken) via the persistent DB-backed limiter so
// the limit holds cross-worker / cross cold-start. Limit: 1/min, 10/hour per key.
export async function reportFinderInPossessionAction(
  publicToken: string,
  _previous: FinderInPossessionState,
  formData: FormData,
): Promise<FinderInPossessionState> {
  if (!publicToken) return { ok: false, error: "Token de mascota inválido." };

  const reqHeaders = await headers();
  const ip = callerIp(reqHeaders);
  try {
    await enforceRateLimit(`finder_possession:${publicToken}`, ip, {
      maxPerMinute: 1,
      maxPerHour: 10,
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return {
        ok: false,
        error: "Ya enviaste un aviso hace poco. Probá de nuevo en unos minutos.",
      };
    }
    throw err;
  }

  // Parse form fields.
  const rawFinderName = String(formData.get("finderName") ?? "").trim();
  const rawFinderPhone = String(formData.get("finderPhone") ?? "").trim();
  const rawFinderEmail = String(formData.get("finderEmail") ?? "").trim();
  // Exact point (L2): the finder drops a pin so the owner knows where to pick up.
  // localityName/provinceName are still emitted by LocationFields (derived from the
  // pin's reverse geocode) and kept as human-readable context — but the required
  // location is now the coordinate pair, not a locality string.
  const loc = parseLocationFromFormData(formData);
  const localityName = loc.locality ?? "";
  const provinceCode = loc.provinceCode ?? "";
  const provinceName = loc.province ?? "";
  const petCondition = String(formData.get("petCondition") ?? "").trim();
  const canKeepUntilRaw = String(formData.get("canKeepUntil") ?? "").trim();
  const canKeepIndefinite = String(formData.get("canKeepIndefinite") ?? "") === "true";
  const message = String(formData.get("message") ?? "").trim();
  const photoFile =
    formData.get("photoNow") instanceof File ? (formData.get("photoNow") as File) : null;

  // Validation.
  const finderName = rawFinderName ? rawFinderName.slice(0, 80) : "";
  if (!finderName) return { ok: false, error: "Falta tu nombre." };

  const finderPhone = rawFinderPhone ? rawFinderPhone.slice(0, 40) : null;
  const finderEmail = rawFinderEmail ? rawFinderEmail.slice(0, 120) : null;
  if (!finderPhone && !finderEmail) {
    return { ok: false, error: "Dejá al menos un medio de contacto (teléfono o email)." };
  }

  if (
    loc.lat === null ||
    loc.lng === null ||
    !Number.isFinite(loc.lat) ||
    !Number.isFinite(loc.lng)
  ) {
    return { ok: false, error: "Marcá en el mapa dónde tenés a la mascota." };
  }
  const lat = loc.lat;
  const lng = loc.lng;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "La ubicación está fuera de rango." };
  }

  const VALID_CONDITIONS = ["bien", "herida", "asustada", "necesita_vet_urgente"] as const;
  if (!VALID_CONDITIONS.includes(petCondition as (typeof VALID_CONDITIONS)[number])) {
    return { ok: false, error: "Seleccioná el estado de la mascota." };
  }

  if (!canKeepIndefinite && !canKeepUntilRaw) {
    return {
      ok: false,
      error: "Indicá hasta cuándo podés cuidarla o marcá que podés tenerla indefinidamente.",
    };
  }

  let canKeepUntil: Date | null = null;
  if (!canKeepIndefinite && canKeepUntilRaw) {
    canKeepUntil = new Date(canKeepUntilRaw);
    if (Number.isNaN(canKeepUntil.getTime())) {
      return { ok: false, error: "La fecha hasta cuándo podés cuidarla es inválida." };
    }
  }

  const safeMessage = message.slice(0, 500);

  // Resolve pet.
  const [pet] = await db
    .select({
      id: pets.id,
      name: pets.name,
      status: pets.status,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };
  if (pet.status !== "lost") {
    return { ok: false, error: "Esta mascota no está marcada como perdida." };
  }

  // Resolve owner.
  const [owner] = await db
    .select({ userId: ownerships.ownerUserId })
    .from(ownerships)
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);
  if (!owner?.userId) return { ok: false, error: "No se encontró un dueño activo." };

  // Build the canonical contact string: phone takes precedence; append email
  // when both are provided. The schema's finderContact is a single text field.
  const primaryContact = finderPhone ?? finderEmail ?? "";
  const finderContact =
    finderPhone && finderEmail ? `${finderPhone} / ${finderEmail}` : primaryContact;

  // Idempotency: skip insert when an identical finder_in_possession event for
  // (petId, finderContact) already exists in the last 5 minutes.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [existingEvent] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.petId, pet.id),
        eq(petEvents.eventType, "note_added"),
        gt(petEvents.recordedAt, fiveMinutesAgo),
        sql`${petEvents.payload}->>'kind' = 'finder_in_possession'`,
        sql`${petEvents.payload}->>'finderContact' = ${finderContact}`,
      ),
    )
    .limit(1);

  if (existingEvent) {
    // Idempotent: return ok so the UI shows the success state without alarming
    // the finder — from their perspective the report was already sent.
    return { ok: true, error: null };
  }

  // Optional photo upload. Non-fatal on failure.
  // Uses service-role admin client: anonymous action, RLS grants INSERT only to
  // authenticated; admin client bypasses RLS.
  // P0g: stripMetadata:true strips EXIF GPS + camera metadata via sharp before upload.
  let photoStoragePath: string | null = null;
  let photoMimeType: string | null = null;
  let photoSize: number | null = null;
  let photoWarning: string | null = null;
  if (photoFile && photoFile.size > 0) {
    const adminSupabase = createAdminClient();
    const uploadResult = await uploadAttachmentIfPresent(
      adminSupabase,
      photoFile,
      "event-attachments",
      {
        stripMetadata: true,
      },
    );
    if (uploadResult.error) {
      console.warn("[finder-possession] Photo upload failed (non-fatal):", uploadResult.error);
      photoWarning = "No se pudo subir la foto, pero el aviso fue registrado igual.";
    } else {
      photoStoragePath = uploadResult.uploadedPath;
      photoMimeType = uploadResult.mimeType;
      photoSize = uploadResult.size;
    }
  }

  // Resolve the open lost case for caseId association.
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

  // Optionally resolve logged-in user identity (no redirect — public route).
  // Used to set recordedByUserId + authorVerified when the finder is logged in.
  let recordedByUserId: string | null = null;
  let authorVerified = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      recordedByUserId = user.id;
      authorVerified = true;
    }
  } catch {
    // Non-fatal: anonymous path — proceed without user context.
  }

  // Build and validate the full payload in one pass through the strict Zod schema.
  // The schema now includes the possession-specific fields (location, petCondition,
  // canKeepUntil, canKeepIndefinite, message) alongside the base note_added fields.
  // validateEventPayload returns the parsed value (with payload_version filled in);
  // that returned object — not the raw input — is persisted to the JSONB column.
  // Human-readable location: prefer the reverse-geocoded locality/province; fall
  // back to the raw coordinates when the pin didn't resolve to a place name.
  const locationLabel =
    [localityName, provinceName].filter(Boolean).join(", ") ||
    `el punto marcado (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
  const noteText = `${finderName} tiene a ${pet.name}. Condición: ${petCondition}. Ubicación: ${locationLabel}.`;
  const payload = validateEventPayload("note_added", {
    category: "otro" as const,
    text: noteText,
    kind: "finder_in_possession" as const,
    finderName,
    finderContact,
    photoStoragePath: photoStoragePath ?? undefined,
    location: {
      localityName,
      provinceCode: provinceCode || null,
      provinceName: provinceName || null,
    },
    petCondition: petCondition as "bien" | "herida" | "asustada" | "necesita_vet_urgente",
    canKeepUntil: canKeepIndefinite ? null : (canKeepUntil?.toISOString() ?? null),
    canKeepIndefinite,
    message: safeMessage || null,
  });

  const [insertedEvent] = await db
    .insert(petEvents)
    .values({
      petId: pet.id,
      eventType: "note_added",
      occurredAt: new Date(),
      recordedAt: new Date(),
      recordedByUserId,
      authorRole: "finder",
      authorVerified,
      payload,
      locationLat: lat.toString(),
      locationLng: lng.toString(),
      caseId: openCase?.id ?? null,
    })
    .returning({ id: petEvents.id });

  // P0g: also insert into the attachments table so the historial/eventos/EventTimeline
  // surfaces render the photo for free (they read attachments, not the payload JSONB).
  // uploadedByUserId: use recordedByUserId when the finder is logged in, null for anon.
  // Mirror pattern from app/actions/events.ts (checkin, vaccination, etc.).
  if (photoStoragePath && insertedEvent) {
    await db.insert(attachments).values({
      petId: pet.id,
      eventId: insertedEvent.id,
      uploadedByUserId: recordedByUserId,
      storagePath: photoStoragePath,
      mimeType: photoMimeType ?? "image/jpeg",
      fileSize: photoSize ?? 0,
    });
  }

  // Notification to owner.
  const locationDisplay = locationLabel;

  const contactDisplay =
    finderPhone && finderEmail
      ? `${finderPhone} / ${finderEmail}`
      : (finderPhone ?? finderEmail ?? finderContact);

  const isUrgent = petCondition === "necesita_vet_urgente";

  const notifBody = [
    `${finderName} dice que tiene a ${pet.name} en ${locationDisplay}.`,
    isUrgent ? "URGENTE: necesita atención veterinaria." : `Estado: ${petCondition}.`,
    `Contactalo/a al ${contactDisplay}.`,
    safeMessage ? `Mensaje: "${safeMessage}".` : null,
    canKeepIndefinite
      ? "Puede cuidarlo indefinidamente."
      : canKeepUntil
        ? `Puede cuidarlo hasta ${canKeepUntil.toLocaleDateString("es-AR")}.`
        : null,
  ]
    .filter(Boolean)
    .join(" ");

  await db.insert(notifications).values({
    userId: owner.userId,
    notificationType: "pet_in_possession",
    title: isUrgent
      ? `🚨 URGENTE: Alguien tiene a ${pet.name} y necesita vet`
      : `🚨 Alguien tiene a ${pet.name}`,
    body: notifBody,
    severity: "urgent",
    category: "perdidas",
    relatedPetId: pet.id,
    ctaLabel: "Ver mascota",
    // When the pet is lost the cockpit IS /mis-mascotas/{token} and now surfaces
    // possession/sighting reports — land the owner there so they can act (UI-4 fix 7).
    ctaUrl: `/mis-mascotas/${publicToken}`,
  });

  return { ok: true, error: null, warning: photoWarning };
}
