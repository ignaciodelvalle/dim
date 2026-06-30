// Use-case: notifyOwnerOfFoundPet — anonymous found-pet notification (strangler migration 44/61).
//
// Public, anon-callable server action for /p/[publicToken].
//
// These are reachable without auth — anyone scanning a QR can invoke them.
// Each action verifies its input by public_token + status. No PII is returned
// to the caller; the notification path uses Drizzle (bypasses RLS) to write
// a notification row scoped to the pet's current owner.
//
// Rate limiting: notifyOwnerOfFoundPetAction uses the persistent DB-backed
// enforceRateLimit (rate_limit_buckets) keyed by (IP, publicToken) so the
// limit is enforced cross-worker / cross cold-start on Vercel's multi-instance
// serverless runtime. Limit: 1/min, 10/hour per (IP, token).
//
// @no-auth-required: anonymous finder submits the form via the public-finder
// page. Rate-limited by (IP + publicToken) via the persistent DB-backed limiter
// to mitigate abuse across all Vercel workers. Limit: 1/min, 10/hour per key.
//
// ARCH-P: the single db.insert(notifications) is wrapped in try/catch so a
// notification failure never surfaces an error to the anonymous finder (they
// already submitted successfully at that point).

import { db, notifications, ownerships, pets } from "@/db";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import type { PublicActionState } from "./types";

export async function notifyOwnerOfFoundPet(
  publicToken: string,
  _previous: PublicActionState,
  formData: FormData,
): Promise<PublicActionState> {
  if (!publicToken) return { ok: false, error: "Token de mascota inválido." };

  // Read the trusted caller IP via callerIp() — prefers x-real-ip (edge-set),
  // falls back to the LAST segment of x-forwarded-for (edge-appended hop).
  // Never uses the first XFF segment, which is client-controlled and spoofable.
  const reqHeaders = await headers();
  const ip = callerIp(reqHeaders);
  try {
    await enforceRateLimit(`found_notify:${publicToken}`, ip, {
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

  const finderName = String(formData.get("finderName") ?? "").trim();
  const finderContact = String(formData.get("finderContact") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!finderName) return { ok: false, error: "Falta tu nombre." };
  if (!finderContact) {
    return { ok: false, error: "Falta tu contacto (teléfono o email)." };
  }

  const [pet] = await db
    .select({ id: pets.id, name: pets.name, status: pets.status, publicToken: pets.publicToken })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // The form is part of Tier 0 per AGENTS.md:376 — anyone scanning the QR can
  // notify the owner regardless of pet status. The notification is the
  // owner-side projection; there is no public broadcast and no PII exposure
  // back to the finder.

  const [owner] = await db
    .select({ userId: ownerships.ownerUserId })
    .from(ownerships)
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);
  if (!owner?.userId) return { ok: false, error: "No se encontró un dueño activo." };

  // Truncate finder-supplied strings so a notification cannot be used as a
  // payload-size vector. Plenty of room for a useful message.
  const safeName = finderName.slice(0, 80);
  const safeContact = finderContact.slice(0, 120);
  const safeMessage = message.slice(0, 500);

  const body = safeMessage
    ? `${safeName} dejó un mensaje: "${safeMessage}". Te podés contactar al ${safeContact}.`
    : `${safeName} encontró a ${pet.name}. Te podés contactar al ${safeContact}.`;

  // Insert notification — best-effort; a failure must not surface an error to the
  // anonymous finder (they already submitted successfully).
  try {
    await db.insert(notifications).values({
      userId: owner.userId,
      notificationType: "pet_found_report",
      title: `Alguien encontró a ${pet.name}`,
      body,
      severity: "urgent",
      category: "perdidas",
      relatedPetId: pet.id,
      ctaLabel: "Ver mascota",
      ctaUrl: `/mis-mascotas/${pet.publicToken}`,
    });
  } catch (e) {
    console.error("notifications insert failed (notifyOwnerOfFoundPetAction did succeed)", e);
  }

  return { ok: true, error: null };
}
