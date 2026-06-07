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
import { materializeSlotsForRule } from "@/lib/slot-materialization";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

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
// @no-auth-required: cron-driven materialization, no caller identity.
// Idempotent via onConflictDoNothing on (service_offering_id, starts_at).
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

// @no-auth-required: pure inner writer; the "Materializar ahora" button
// calls this from a vet-portal action that already auth-gates the caller.
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
 * Server action wired to the "Materializar ahora" button on org agenda pages.
 *
 * Authorization: requireCapability('service_offering.create') + offering must
 * belong to the org.
 */
export async function materializeOfferingNowAction(
  offeringToken: string,
): Promise<MaterializeNowResult> {
  const [offering] = await db
    .select({
      id: serviceOfferings.id,
      organizationId: serviceOfferings.organizationId,
      status: serviceOfferings.status,
    })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.publicToken, offeringToken))
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status !== "approved") {
    return { error: "Solo se pueden materializar turnos para servicios aprobados." };
  }
  if (!offering.organizationId) return { error: "Proveedor del servicio no reconocido." };

  const auth = await requireCapability("service_offering.create", offering.organizationId);
  if (auth.error !== null) return { error: auth.error };
  if (auth.organization?.id !== offering.organizationId) {
    return { error: "No tenés permiso para materializar turnos de este servicio." };
  }

  try {
    const result = await materializeSlotsForOffering(offering.id);
    revalidatePath(`/org/${auth.organization.publicToken}/servicios/${offeringToken}/agenda`);
    return result;
  } catch (err) {
    return {
      error: `Error al materializar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }
}
