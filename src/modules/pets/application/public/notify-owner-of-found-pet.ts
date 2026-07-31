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
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { DISPUTE_TIP_NOTICE } from "@/lib/ui/dispute-copy";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";

import type { PublicActionState } from "./types";

export async function notifyOwnerOfFoundPet(
  publicToken: string,
  _previous: PublicActionState,
  formData: FormData,
): Promise<PublicActionState> {
  if (!publicToken) return { ok: false, error: "Token de mascota inválido." };

  // PO 2026-07-24: name and contact are OPTIONAL — an anonymous found-report
  // still tells the owner their pet was found, which beats a finder bouncing
  // off a mandatory form. The UI explains why leaving a contact helps.
  const finderName = String(formData.get("finderName") ?? "").trim();
  const finderContact = String(formData.get("finderContact") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const [pet] = await db
    .select({
      id: pets.id,
      name: pets.name,
      status: pets.status,
      publicToken: pets.publicToken,
      inCustodyDispute: pets.inCustodyDispute,
    })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // D2 hardening (red-team 2026-07): while titularidad is under review the
  // system must not relay the finder's name/contact to the contested owner —
  // that takes sides in a legal dispute. Server-side gate, not just UI: the
  // credential page hides the form, but the action is anon-callable.
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

  // Rate limit — consumed only AFTER validation passes (tester fix #6): a
  // rejected submission (bad token, unknown pet, disputed pet) must not burn
  // the (IP, token) budget. Reads the trusted caller IP via callerIp()
  // — prefers x-real-ip (edge-set), falls back to the LAST segment of
  // x-forwarded-for; never the first XFF segment (client-spoofable).
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

  // Truncate finder-supplied strings so a notification cannot be used as a
  // payload-size vector. Plenty of room for a useful message.
  const safeName = finderName.slice(0, 80);
  const safeContact = finderContact.slice(0, 120);
  const safeMessage = message.slice(0, 500);

  // Anonymous-safe body: never render an empty name slot, and be honest when
  // there is no way to call back (the owner should not hunt for a contact
  // that was never left).
  const who = safeName || "Alguien";
  const contactLine = safeContact
    ? ` Te podés contactar al ${safeContact}.`
    : " No dejó datos de contacto.";
  const body = safeMessage
    ? `${who} dejó un mensaje: "${safeMessage}".${contactLine}`
    : `${who} encontró a ${pet.name}.${contactLine}`;

  // Insert notification — best-effort; a failure must not surface an error to the
  // anonymous finder (they already submitted successfully).
  const foundNotification = {
    userId: owner.userId,
    notificationType: "pet_found_report",
    title: `Alguien encontró a ${pet.name}`,
    body,
    severity: "urgent" as const,
    category: "perdidas",
    relatedPetId: pet.id,
    ctaLabel: "Ver mascota",
    ctaUrl: `/mis-mascotas/${pet.publicToken}`,
  };
  try {
    await db.insert(notifications).values(foundNotification);
    // Web Push leg (ADR 2026-07-18 §4): urgent hallazgo, best-effort, never throws.
    const { sendPushForNotifications } = await import("@/lib/infra/web-push");
    await sendPushForNotifications([foundNotification]);
  } catch (e) {
    console.error("notifications insert failed (notifyOwnerOfFoundPetAction did succeed)", e);
  }

  return { ok: true, error: null };
}
