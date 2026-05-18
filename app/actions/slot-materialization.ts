"use server";

// Slot materialization writer — Fase 3.
//
// materializeAllActiveSlots(): loads ALL active rules for approved offerings,
// calls the pure generator, and bulk-inserts with onConflictDoNothing() so
// re-runs are idempotent.
//
// materializeSlotsForOffering(): same, scoped to a single offering by DB id.
//
// materializeOfferingNowAction(): server action called by the "Materializar
// ahora" button on agenda pages. Authorizes per provider type, then delegates
// to materializeSlotsForOffering.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, serviceOfferings, serviceScheduleRules, timeSlots } from "@/db";
import { requireUserOrRedirect, requireVetProviderOrRedirect } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";
import { materializeSlotsForRule } from "@/lib/slot-materialization";

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function rollingWindow(): { windowStart: Date; windowEnd: Date } {
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + 60 * 24 * 60 * 60 * 1000); // +60 days
  return { windowStart, windowEnd };
}

// ────────────────────────────────────────────────────────────────────────────
// Inner writers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Materializes slots for all approved offerings with active schedule rules.
 * Safe to call in a cron — idempotent via onConflictDoNothing on the
 * (service_offering_id, starts_at) unique index.
 */
export async function materializeAllActiveSlots(): Promise<{
  rulesProcessed: number;
  slotsInserted: number;
}> {
  const { windowStart, windowEnd } = rollingWindow();

  // Load all active rules joined to their offering (approved only).
  const rows = await db
    .select({
      rule: serviceScheduleRules,
      offering: {
        id: serviceOfferings.id,
        slotCapacity: serviceOfferings.slotCapacity,
        durationMinutes: serviceOfferings.durationMinutes,
      },
    })
    .from(serviceScheduleRules)
    .innerJoin(serviceOfferings, eq(serviceScheduleRules.serviceOfferingId, serviceOfferings.id))
    .where(and(eq(serviceScheduleRules.status, "active"), eq(serviceOfferings.status, "approved")));

  let slotsInserted = 0;

  for (const { rule, offering } of rows) {
    const candidates = materializeSlotsForRule({ rule, offering }, windowStart, windowEnd);
    if (candidates.length === 0) continue;

    const result = await db
      .insert(timeSlots)
      .values(candidates)
      .onConflictDoNothing({ target: [timeSlots.serviceOfferingId, timeSlots.startsAt] });

    // rowCount is available on the pg query result.
    slotsInserted += (result as { rowCount?: number }).rowCount ?? 0;
  }

  return { rulesProcessed: rows.length, slotsInserted };
}

/**
 * Same as materializeAllActiveSlots but scoped to one offering by DB id.
 * Used by the "Materializar ahora" button for immediate preview.
 */
export async function materializeSlotsForOffering(offeringId: string): Promise<{
  rulesProcessed: number;
  slotsInserted: number;
}> {
  const { windowStart, windowEnd } = rollingWindow();

  const rows = await db
    .select({
      rule: serviceScheduleRules,
      offering: {
        id: serviceOfferings.id,
        slotCapacity: serviceOfferings.slotCapacity,
        durationMinutes: serviceOfferings.durationMinutes,
      },
    })
    .from(serviceScheduleRules)
    .innerJoin(serviceOfferings, eq(serviceScheduleRules.serviceOfferingId, serviceOfferings.id))
    .where(
      and(
        eq(serviceScheduleRules.serviceOfferingId, offeringId),
        eq(serviceScheduleRules.status, "active"),
        eq(serviceOfferings.status, "approved"),
      ),
    );

  let slotsInserted = 0;

  for (const { rule, offering } of rows) {
    const candidates = materializeSlotsForRule({ rule, offering }, windowStart, windowEnd);
    if (candidates.length === 0) continue;

    const result = await db
      .insert(timeSlots)
      .values(candidates)
      .onConflictDoNothing({ target: [timeSlots.serviceOfferingId, timeSlots.startsAt] });

    slotsInserted += (result as { rowCount?: number }).rowCount ?? 0;
  }

  return { rulesProcessed: rows.length, slotsInserted };
}

// ────────────────────────────────────────────────────────────────────────────
// "Materializar ahora" server action — called by UI buttons
// ────────────────────────────────────────────────────────────────────────────

export type MaterializeNowResult =
  | { rulesProcessed: number; slotsInserted: number }
  | { error: string };

/**
 * Server action wired to the "Materializar ahora" button on both agenda pages.
 *
 * Authorization:
 *   - Org offerings: requireCapability('service_offering.create') + offering must
 *     belong to the org.
 *   - Independent-vet offerings: requireVetProviderOrRedirect + offering.provider_user_id
 *     must match the authenticated user.
 */
export async function materializeOfferingNowAction(
  offeringToken: string,
): Promise<MaterializeNowResult> {
  // Load the offering by token first.
  const [offering] = await db
    .select({
      id: serviceOfferings.id,
      organizationId: serviceOfferings.organizationId,
      providerUserId: serviceOfferings.providerUserId,
      status: serviceOfferings.status,
      publicToken: serviceOfferings.publicToken,
    })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.publicToken, offeringToken))
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status !== "approved") {
    return { error: "Solo se pueden materializar turnos para servicios aprobados." };
  }

  // Authorize based on provider type.
  if (offering.organizationId) {
    // Org-owned offering: check capability.
    const auth = await requireCapability("service_offering.create", offering.organizationId);
    if (auth.error !== null) return { error: auth.error };
    if (auth.organization?.id !== offering.organizationId) {
      return { error: "No tenés permiso para materializar turnos de este servicio." };
    }
  } else if (offering.providerUserId) {
    // Vet-owned offering: check actor identity.
    const { user } = await requireVetProviderOrRedirect();
    if (user.id !== offering.providerUserId) {
      return { error: "No tenés permiso para materializar turnos de este servicio." };
    }
  } else {
    return { error: "Proveedor del servicio no reconocido." };
  }

  try {
    const result = await materializeSlotsForOffering(offering.id);
    // Revalidate the agenda page so the UI reflects the new slots.
    revalidatePath(`/org/[orgToken]/servicios/${offeringToken}/agenda`);
    revalidatePath(`/pro/servicios/${offeringToken}/agenda`);
    return result;
  } catch (err) {
    return {
      error: `Error al materializar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }
}
