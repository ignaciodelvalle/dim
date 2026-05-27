"use server";

// Anonymous "I saw the pet near here" report — Tier 1 (lost mode) only.
// Trilogy unification handoff §3 PR-025.
//
// Distinct from notifyOwnerOfFoundPetAction: the finder does NOT have the
// pet, they just spotted it. We capture lat/lng + an optional description
// and emit:
//   - pet_event note_added (category=otro, text prefixed "[Avistaje]") so
//     the owner sees the sighting in the timeline.
//   - notification (severity=urgent) to the owner.
//
// Rate-limited by (IP, publicToken) per 5 minutes to mitigate abuse. The
// matching limiter for the "I found her" form lives in app/actions/public.ts.

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import { db, notifications, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { makeMemoryRateLimiter } from "@/lib/rate-limit";

export type SightingActionState = { ok: boolean; error: string | null };

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
    ? `[Avistaje] ${safeDescription}`
    : `[Avistaje] Alguien reportó haber visto a ${pet.name} cerca de este punto.`;

  const payload = validateEventPayload("note_added", {
    category: "otro" as const,
    text: noteText,
  });

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
  });

  const bodyParts = [
    `Alguien reportó haber visto a ${pet.name} cerca de un punto.`,
    safeDescription ? `Mensaje: "${safeDescription}".` : null,
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

  return { ok: true, error: null };
}
