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

import {
  attachments,
  cases,
  db,
  notifications,
  organizationMemberships,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { CoordError, normalizeLocationForWrite } from "@/lib/domain/location-normalize";
import { parseLocationFromFormData } from "@/lib/domain/location-value";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { resolveOriginShelterOrgId } from "@/lib/infra/origin-shelter-alert";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { createAdminClient } from "@/lib/supabase/admin";
import { DISPUTE_TIP_NOTICE } from "@/lib/ui/dispute-copy";
import { AR_TIME_ZONE, parseArDatetimeLocal } from "@/lib/utils/format";

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

  // Validation. PO 2026-07-24: name and contact are OPTIONAL — an anonymous
  // handoff report is still a report (the pet is safe somewhere, at a known
  // point). The form explains why leaving a contact helps, without forcing it.
  const finderName = rawFinderName ? rawFinderName.slice(0, 80) : null;
  const finderPhone = rawFinderPhone ? rawFinderPhone.slice(0, 40) : null;
  const finderEmail = rawFinderEmail ? rawFinderEmail.slice(0, 120) : null;

  // requireCoords:true + locality:"none" — coords required and range-checked; no locality
  // lookup (finder possession behavior unchanged, now routed through the shared gate).
  let normalizedLocObj: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLocObj = await normalizeLocationForWrite(loc, {
      locality: "none",
      requireCoords: true,
    });
  } catch (err) {
    if (err instanceof CoordError) {
      return {
        ok: false,
        error:
          err.code === "COORD_REQUIRED"
            ? "Marcá en el mapa dónde tenés a la mascota."
            : "La ubicación está fuera de rango.",
      };
    }
    throw err;
  }
  const lat = normalizedLocObj.lat as number;
  const lng = normalizedLocObj.lng as number;

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
    // datetime-local string typed as AR wall clock — parse it as such
    // (offset-less `new Date(...)` reads it in the server's zone → 3h early).
    canKeepUntil = parseArDatetimeLocal(canKeepUntilRaw);
    if (!canKeepUntil) {
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
      inCustodyDispute: pets.inCustodyDispute,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };
  if (pet.status !== "lost") {
    return { ok: false, error: "Esta mascota no está marcada como perdida." };
  }

  // D2 hardening (red-team 2026-07): a disputed pet's finder flow relays the
  // finder's contact to the contested owner (event payload + urgent
  // notification) — blocked server-side while titularidad is under review.
  if (pet.inCustodyDispute) {
    return {
      ok: false,
      error: `${DISPUTE_TIP_NOTICE} Enviá tu aviso desde la credencial de la mascota.`,
    };
  }

  // Resolve the person to notify (ROUTE-1, audit 2026-08-04).
  //
  // This used to be a bare `.limit(1)` over every ACTIVE ownership row with no
  // role filter and no ordering — so on a pet with an active foster, Postgres
  // was free to hand back the foster and the finder's alert went to them
  // instead of the titular. On the recovery path, which is exactly where
  // mis-routing hurts.
  //
  // A role filter alone would be worse, not better: a pet in shelter custody
  // has no `owner` row at all, and filtering would turn a mis-routed alert into
  // NO alert. So the rows are ranked instead — titular first, then the
  // institution holding custody, then whoever is caring for it — and the winner
  // is the first that exists. Same shape as the resolve-dispute fix.
  const activeHolders = await db
    .select({ userId: ownerships.ownerUserId, role: ownerships.role })
    .from(ownerships)
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)));
  const owner =
    activeHolders.find((r) => r.role === "owner" && r.userId) ??
    activeHolders.find((r) => r.role === "shelter_custody" && r.userId) ??
    activeHolders.find((r) => r.userId);
  if (!owner?.userId) return { ok: false, error: "No se encontró un dueño activo." };

  // Rate limit — consumed only AFTER validation passes (tester fix #6): a
  // rejected form (missing contact, no pin, bad date) must not burn the
  // (IP, token) budget and block the immediate retry. Still guards every
  // write/notification below.
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

  // Build the canonical contact string: phone takes precedence; append email
  // when both are provided. The schema's finderContact is a single text field;
  // null = anonymous handoff (PO 2026-07-24).
  const finderContact =
    finderPhone && finderEmail ? `${finderPhone} / ${finderEmail}` : (finderPhone ?? finderEmail);

  // Idempotency: skip insert when an identical finder_in_possession event for
  // (petId, finderContact) already exists in the last 5 minutes. Only keyed
  // when a contact WAS left — two distinct anonymous finders within 5 minutes
  // must not swallow each other's report (the per-IP 1/min limiter already
  // covers double-taps from the same person).
  if (finderContact) {
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
      // Idempotent: return ok so the UI shows the success state without
      // alarming the finder — from their perspective the report was sent.
      return { ok: true, error: null };
    }
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
      reportError("public-encontre/photo-upload", uploadResult.error, { publicToken });
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

  // Finder anonymity invariant (privacy hardening 2026-07-04): public finder
  // flows NEVER link the report to a DIM account, even when the finder happens
  // to be logged in — mirroring the sighting (report-pet-sighting.ts) and scan
  // (log-scan.ts) contracts. recordedByUserId stays NULL and authorVerified
  // stays false; the finder's identity lives ONLY in the payload fields they
  // typed themselves (finderName / finderContact).

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
  const noteText = `${finderName ?? "Alguien"} tiene a ${pet.name}. Condición: ${petCondition}. Ubicación: ${locationLabel}.`;
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
      // Hard-anonymized: never link a public finder report to a user account.
      recordedByUserId: null,
      authorRole: "finder",
      authorVerified: false,
      payload,
      locationLat: lat.toString(),
      locationLng: lng.toString(),
      caseId: openCase?.id ?? null,
    })
    .returning({ id: petEvents.id });

  // P0g: also insert into the attachments table so the historial/eventos/EventTimeline
  // surfaces render the photo for free (they read attachments, not the payload JSONB).
  // uploadedByUserId is always null — same finder-anonymity invariant as the event row.
  if (photoStoragePath && insertedEvent) {
    await db.insert(attachments).values({
      petId: pet.id,
      eventId: insertedEvent.id,
      uploadedByUserId: null,
      storagePath: photoStoragePath,
      mimeType: photoMimeType ?? "image/jpeg",
      fileSize: photoSize ?? 0,
    });
  }

  // Notification to owner. Anonymous-safe: never render an empty name slot,
  // and be honest when the finder left no way to call back.
  const locationDisplay = locationLabel;

  const isUrgent = petCondition === "necesita_vet_urgente";

  const notifBody = [
    `${finderName ?? "Alguien"} dice que tiene a ${pet.name} en ${locationDisplay}.`,
    isUrgent ? "URGENTE: necesita atención veterinaria." : `Estado: ${petCondition}.`,
    finderContact ? `Contactalo/a al ${finderContact}.` : "No dejó datos de contacto.",
    safeMessage ? `Mensaje: "${safeMessage}".` : null,
    canKeepIndefinite
      ? "Puede cuidarlo indefinidamente."
      : canKeepUntil
        ? `Puede cuidarlo hasta ${canKeepUntil.toLocaleDateString("es-AR", { timeZone: AR_TIME_ZONE })}.`
        : null,
  ]
    .filter(Boolean)
    .join(" ");

  const possessionNotification = {
    userId: owner.userId,
    notificationType: "pet_in_possession",
    title: isUrgent
      ? `URGENTE: Alguien tiene a ${pet.name} y necesita vet`
      : `Alguien tiene a ${pet.name}`,
    body: notifBody,
    severity: "urgent" as const,
    category: "perdidas",
    relatedPetId: pet.id,
    ctaLabel: "Ver mascota",
    // When the pet is lost the cockpit IS /mis-mascotas/{token} and now surfaces
    // possession/sighting reports — land the owner there so they can act (UI-4 fix 7).
    ctaUrl: `/mis-mascotas/${publicToken}`,
  };
  await db.insert(notifications).values(possessionNotification);

  // A5 — the origin shelter also hears about it (PO decision 2026-08-04).
  //
  // A shelter that placed this pet has territorial reach and motivation the
  // titular may not: it is a real second chance at recovery. The PO chose
  // ALWAYS over opt-in, knowing the cost, and the cost is worth naming here
  // because the code is where it becomes real: the shelter learns that an
  // animal it no longer owns turned up, and roughly where — without the titular
  // having asked for that. The mitigation is disclosure, not suppression: the
  // pet's own profile states that the origin shelter is alerted, so the titular
  // is never surprised by it.
  //
  // "Origin shelter" = the organization whose shelter_custody row was closed
  // most recently. That is the handoff that produced the current titular
  // (adoption, or a return to owner), and it is derived rather than stored so a
  // pet that passed through two shelters credits the one that placed it.
  //
  // Deliberately does NOT carry the finder's contact details — only that the
  // pet appeared and where. The finder shared their phone with the TITULAR, not
  // with an institution they never chose.
  // The predicate itself lives in lib/infra/origin-shelter-alert.ts so the
  // titular's profile disclosure can promise EXACTLY the pets this notifies.
  const originShelterOrgId = await resolveOriginShelterOrgId(pet.id);

  if (originShelterOrgId) {
    const shelterAdmins = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, originShelterOrgId),
          isNull(organizationMemberships.leftAt),
        ),
      );

    if (shelterAdmins.length > 0) {
      const shelterNotifications = shelterAdmins.map((m) => ({
        userId: m.userId,
        notificationType: "origin_shelter_pet_found",
        title: `Apareció ${pet.name}, que salió de tu refugio`,
        body: `Alguien reportó tenerla en su poder${
          locationLabel ? ` en ${locationLabel}` : ""
        }. El titular ya fue avisado.`,
        severity: "info" as const,
        category: "perdidas",
        relatedPetId: pet.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/p/${publicToken}`,
      }));
      // Best-effort: the finder's report is already recorded and the titular
      // already notified. A failure here must never surface to the finder.
      try {
        await db.insert(notifications).values(shelterNotifications);
      } catch (err) {
        reportError("encontre:origin-shelter-notify", err, { petId: pet.id });
      }
    }
  }

  // Web Push leg (ADR 2026-07-18 §4): urgent hallazgo en posesión — best-effort,
  // never throws, so it cannot affect the finder's already-recorded submission.
  const { sendPushForNotifications } = await import("@/lib/infra/web-push");
  await sendPushForNotifications([possessionNotification]);

  return { ok: true, error: null, warning: photoWarning };
}
