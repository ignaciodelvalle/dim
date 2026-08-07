// Use-case: reportPetSighting — anonymous pet sighting report (strangler migration 29/61).
//
// Anonymous "I saw the pet near here" report — Tier 1 (lost mode) only.
// Trilogy unification handoff §3 PR-025.
//
// Distinct from notifyOwnerOfFoundPetAction: the finder does NOT have the
// pet, they just spotted it. We capture lat/lng + an optional description
// and emit:
//   - pet_event note_added (category=otro, kind="sighting", raw description
//     text) so the owner sees the sighting in the timeline and sightingsCount
//     can be derived from payload->>'kind' = 'sighting'.
//   - notification (pet_sighting, severity=warning) to the owner. A sighting
//     is NOT a hallazgo: it gets its own notification type and a high-but-
//     distinct severity so the Bandeja never styles "someone saw the pet" like
//     "someone HAS the pet" (external tester fix list #1, ciclo perdido).
//
// Rate-limited by (IP, publicToken) per 5 minutes to mitigate abuse. The
// matching limiter for the "I found her" form lives in app/actions/public.ts.
//
// P0d additions: optional photo upload, finderName, finderContact.
// Photo is uploaded to the "event-attachments" bucket via uploadAttachmentIfPresent.
// A failed upload is non-fatal — the sighting is still recorded without the photo.
// P0g: EXIF metadata (including GPS) is stripped from finder photos via sharp
// before upload. Non-fatal: falls back to original if sharp throws.
// P0g: photo also inserted into the attachments table (linked to the event) so
// the historial / eventos / EventTimeline surfaces can render it for free.
//
// @no-auth-required: anonymous sighting submission via /p/[token]/sighting.
// Rate-limited by (IP + publicToken) via the persistent DB-backed limiter so
// the limit holds cross-worker / cross cold-start. Limit: 1/min, 10/hour per key.
//
// Capability-enforcement is not applicable: this use-case is anonymous.
// The thin shim (app/actions/pet-sighting.ts) delegates here directly with
// the full set of raw arguments.
//
// ARCH-P: the single db.insert(notifications) is wrapped in try/catch so a
// notification failure never surfaces an error to the reporter (the sighting
// was already recorded successfully at that point).

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { attachments, cases, db, notifications, ownerships, pets } from "@/db";
import { CoordError, normalizeLocationForWrite } from "@/lib/domain/location-normalize";
import { parseLocationFromFormData } from "@/lib/domain/location-value";
import { insertEventIdempotent } from "@/lib/events/event-idempotency";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { publicPetByToken } from "@/lib/infra/public-pet-lookup";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { createAdminClient } from "@/lib/supabase/admin";
import { DISPUTE_TIP_NOTICE } from "@/lib/ui/dispute-copy";
import { parseArDatetimeLocal } from "@/lib/utils/format";

import type { SightingActionState } from "./types";

export async function reportPetSighting(
  publicToken: string,
  _previous: SightingActionState,
  formData: FormData,
): Promise<SightingActionState> {
  if (!publicToken) return { ok: false, error: "Token de mascota inválido." };

  const loc = parseLocationFromFormData(formData);
  const description = String(formData.get("description") ?? "").trim();
  const sightedAtIso = String(formData.get("sightedAt") ?? "").trim();

  // panorama-event-points Slice 1: how the coordinate was captured (LocationFields
  // emits a `locationSource` hidden field). Only the three known enum values are
  // honored; anything else (absent / legacy form) leaves it undefined so the zod
  // optional passes and the payload simply omits it.
  const rawLocationSource = String(formData.get("locationSource") ?? "").trim();
  const locationSource =
    rawLocationSource === "gps" ||
    rawLocationSource === "pin_manual" ||
    rawLocationSource === "geocodificada"
      ? (rawLocationSource as "gps" | "pin_manual" | "geocodificada")
      : undefined;

  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  // P0d: optional finder identity + photo.
  const rawFinderName = String(formData.get("finderName") ?? "").trim();
  const rawFinderContact = String(formData.get("finderContact") ?? "").trim();
  const finderName = rawFinderName ? rawFinderName.slice(0, 80) : null;
  const finderContact = rawFinderContact ? rawFinderContact.slice(0, 120) : null;
  const photoFile = formData.get("photo") instanceof File ? (formData.get("photo") as File) : null;

  // requireCoords:true + locality:"none" — coords required and range-checked; no locality
  // lookup (sighting behavior unchanged, now routed through the shared gate).
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none", requireCoords: true });
  } catch (err) {
    if (err instanceof CoordError) {
      return {
        ok: false,
        error:
          err.code === "COORD_REQUIRED"
            ? "Marcá un punto en el mapa para indicar dónde la viste."
            : "La ubicación está fuera de rango.",
      };
    }
    throw err;
  }
  const lat = normalizedLoc.lat as number;
  const lng = normalizedLoc.lng as number;

  const [pet] = await db
    .select({
      id: pets.id,
      name: pets.name,
      status: pets.status,
      inCustodyDispute: pets.inCustodyDispute,
    })
    .from(pets)
    // PO-4: a soft-deleted pet resolves nowhere public. The page hosting this
    // form already 404s — this is the hand-rolled-POST half of the same gate.
    .where(publicPetByToken(publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };
  if (pet.status !== "lost") {
    // Only meaningful while the pet is in lost mode.
    return { ok: false, error: "Esta mascota no está marcada como perdida." };
  }

  // D2 hardening (red-team 2026-07): the sighting flow ends in an owner
  // notification AND an owner-visible timeline payload that can carry the
  // finder's contact — it cannot be cleanly separated from the relay, so a
  // disputed pet blocks the whole submission server-side.
  //
  // The finder is NOT left without a channel (PO decision 2026-07-30): both
  // the credential and the two standalone finder routes now render the
  // neutral tip form, whose submission lands on the dispute case for the
  // reviewing authority only (report-dispute-tip.ts). This refusal is what a
  // hand-rolled POST hits — no UI points at it anymore.
  if (pet.inCustodyDispute) {
    return {
      ok: false,
      error: `${DISPUTE_TIP_NOTICE} Enviá tu aviso desde la credencial de la mascota.`,
    };
  }

  const [owner] = await db
    .select({ userId: ownerships.ownerUserId })
    .from(ownerships)
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);
  if (!owner?.userId) return { ok: false, error: "No se encontró un dueño activo." };

  const safeDescription = description.slice(0, 500);
  // The sightedAt input is a datetime-local defaulted to AR wall clock — read
  // it back as AR wall clock (offset-less `new Date(...)` would parse it in
  // the server's zone, i.e. UTC → 3h early).
  const occurredAt = sightedAtIso ? parseArDatetimeLocal(sightedAtIso) : new Date();
  if (!occurredAt) {
    return { ok: false, error: "Fecha y hora del avistaje inválida." };
  }

  // Rate limit — consumed only AFTER validation passes (tester fix #6): a
  // validation-rejected submission (missing pin, invalid date) used to burn
  // the (IP, token) budget and block the immediate retry. The limiter still
  // guards everything that writes or notifies below.
  const reqHeaders = await headers();
  const ip = callerIp(reqHeaders);
  try {
    await enforceRateLimit(`sighting:${publicToken}`, ip, {
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

  const noteText = safeDescription
    ? safeDescription
    : `Alguien reportó haber visto a ${pet.name} cerca de este punto.`;

  // P0d/P0g: upload photo if present. Non-fatal — sighting is recorded even when upload fails.
  // Uses the service-role admin client because this action is anonymous (@no-auth-required)
  // and the event-attachments bucket's RLS grants INSERT only to authenticated roles.
  // The admin client bypasses RLS so anonymous finders can attach photos.
  // P0g: stripMetadata:true strips EXIF GPS + camera metadata via sharp before upload.
  let photoStoragePath: string | null = null;
  let photoMimeType: string | null = null;
  let photoSize: number | null = null;
  let photoWarning: string | null = null;
  if (photoFile && photoFile.size > 0) {
    const supabase = createAdminClient();
    const uploadResult = await uploadAttachmentIfPresent(supabase, photoFile, "event-attachments", {
      stripMetadata: true,
    });
    if (uploadResult.error) {
      console.warn("[pet-sighting] Photo upload failed (non-fatal):", uploadResult.error);
      photoWarning = "No se pudo subir la foto, pero el avistaje fue registrado igual.";
    } else {
      photoStoragePath = uploadResult.uploadedPath;
      photoMimeType = uploadResult.mimeType;
      photoSize = uploadResult.size;
    }
  }

  const payload = validateEventPayload("note_added", {
    category: "otro" as const,
    text: noteText,
    kind: "sighting" as const,
    finderName: finderName ?? undefined,
    finderContact: finderContact ?? undefined,
    photoStoragePath: photoStoragePath ?? undefined,
    location_source: locationSource,
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

  // P4 item 3 (2026-07-08): insertEventIdempotent's advisory lock requires an
  // active transaction (pg_advisory_xact_lock is tx-scoped) — this call site
  // used to pass no executor (defaulting to the bare `db`), so the lock would
  // acquire-and-release inside its own auto-committed statement and never
  // actually hold across the insert. Wrapping in db.transaction() closes that.
  const { event: insertedEvent, wasNoop } = await db.transaction((tx) =>
    insertEventIdempotent(
      {
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
        clientIdempotencyKey,
      },
      tx,
    ),
  );

  // Idempotency: a duplicate submission with the same key means the event was
  // already recorded. Return ok without re-sending the notification.
  if (wasNoop) {
    return { ok: true, error: null };
  }

  // P0g: also insert into the attachments table so the historial/eventos/EventTimeline
  // surfaces render the photo for free (they read attachments, not the payload JSONB).
  // uploadedByUserId is null: anonymous sighting — no authenticated user.
  // Mirror pattern from app/actions/events.ts (checkin, vaccination, etc.).
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

  // Insert notification — best-effort; a failure must not surface an error to the
  // reporter (the sighting was already recorded successfully).
  // Taxonomy: a sighting is its own notification type ("pet_sighting"), never
  // "pet_found_report" — the finder does NOT have the pet. Severity "warning"
  // keeps it elevated in the Bandeja while visually distinct from the urgent
  // possession/found alerts (red bar vs amber bar).
  const sightingNotification = {
    userId: owner.userId,
    notificationType: "pet_sighting",
    title: `Avistaje de ${pet.name}`,
    body: bodyParts.join(" "),
    severity: "warning" as const,
    category: "perdidas",
    relatedPetId: pet.id,
    ctaLabel: "Ver mascota",
    // Land on the cockpit (/mis-mascotas/{token}) which now surfaces sighting
    // and possession reports while the pet is lost (UI-4 fix 7).
    ctaUrl: `/mis-mascotas/${publicToken}`,
  };
  try {
    await db.insert(notifications).values(sightingNotification);
    // Web Push leg (ADR 2026-07-18 §4): avistaje, best-effort, never throws.
    // pet_sighting rows push despite warning severity (see sendPushForNotifications).
    const { sendPushForNotifications } = await import("@/lib/infra/web-push");
    await sendPushForNotifications([sightingNotification]);
  } catch (e) {
    console.error("notifications insert failed (reportPetSightingAction did succeed)", e);
  }

  return { ok: true, error: null, warning: photoWarning };
}
