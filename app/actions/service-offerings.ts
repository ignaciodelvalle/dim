"use server";

// Server actions for the service offering approval workflow (Fase 1 + 1.5 + 2.5).
//
// Writer/wrapper split:
//   - Inner writers (createServiceOfferingForOrg, createServiceOfferingForVetProvider,
//     approve*, reject*) are pure DB functions: testable without FormData or
//     Supabase session context.
//   - Wrappers gate auth + capability, then delegate to the inner writer.
//
// Fase 1.5 — approval routing: createServiceOfferingForOrg uses
// findAuthoritiesForJurisdiction to notify the governing govt(s) first,
// falling back to all admins when no govt covers the locality.
//
// Fase 2.5 — shared writer: createServiceOfferingWriter accepts EITHER an
// organizationId OR a providerUserId (discriminated union, matching the DB
// CHECK constraint provider_xor). Both org and vet outer wrappers call it.

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  appointments,
  db,
  notifications,
  organizationMemberships,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { CoordError, normalizeLocationForWrite } from "@/lib/location-normalize";
import { generateOfferingToken } from "@/lib/publicToken";
import { CreateServiceOfferingInput } from "@/lib/scheduling-schemas";
import { findServiceKind } from "@/lib/service-kinds";
import { createClient } from "@/lib/supabase/server";
import { generateUniqueToken } from "@/lib/unique-token";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

// ============================================================================
// Types
// ============================================================================

export type ServiceOfferingResult = { error: string } | { ok: true };

type OrgProvider = {
  organizationId: string;
  organizationPublicToken: string;
  organizationDisplayName: string;
};

// ============================================================================
// Inner writers — testable without auth context
// ============================================================================

// Org-side inner writer. Delegates to the shared writer below.
export async function createServiceOfferingForOrg(
  actorUserId: string,
  orgId: string,
  orgToken: string,
  orgDisplayName: string,
  orgProvince: string | null,
  orgLocality: string | null,
  input: {
    serviceKind: string;
    displayName: string;
    description: string | null;
    durationMinutes: number;
    slotCapacity: number;
    priceArs: number | null;
    eligibilitySpecies: ("dog" | "cat")[] | null;
    eligibilityAgeMinMonths: number | null;
    eligibilityAgeMaxMonths: number | null;
  },
): Promise<ServiceOfferingResult> {
  return createServiceOfferingWriter(
    actorUserId,
    {
      organizationId: orgId,
      organizationPublicToken: orgToken,
      organizationDisplayName: orgDisplayName,
    },
    orgProvince ?? "",
    orgLocality ?? "",
    input,
  );
}

async function createServiceOfferingWriter(
  actorUserId: string,
  provider: OrgProvider,
  province: string,
  locality: string,
  input: {
    serviceKind: string;
    displayName: string;
    description: string | null;
    durationMinutes: number;
    slotCapacity: number;
    priceArs: number | null;
    eligibilitySpecies: ("dog" | "cat")[] | null;
    eligibilityAgeMinMonths: number | null;
    eligibilityAgeMaxMonths: number | null;
  },
): Promise<ServiceOfferingResult> {
  const parsed = CreateServiceOfferingInput.safeParse(input);
  if (!parsed.success) {
    return { error: `Datos inválidos: ${parsed.error.issues[0]?.message ?? "error"}` };
  }

  const kindDef = findServiceKind(parsed.data.serviceKind);
  if (!kindDef) {
    return { error: "Tipo de servicio no reconocido." };
  }

  // Canonicalize jurisdiction so the approval routing + future filters
  // agree on the INDEC spelling. When both fields are empty (vet provider
  // without operational scope yet), persist as null. When the lookup misses
  // (uncatalogued locality), we keep the trimmed input — tolerant variant.
  // locality:"soft" — tryResolveCanonicalJurisdiction (service-offering behavior unchanged).
  let normalized: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalized = await normalizeLocationForWrite(
      {
        province,
        provinceCode: null,
        locality,
        localityIndecId: null,
        lat: null,
        lng: null,
        address: null,
      },
      { locality: "soft" },
    );
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }
  const canonicalProvince: string | null = normalized.province || null;
  const canonicalLocality: string | null = normalized.locality || null;

  const publicToken = await generateUniqueToken(
    serviceOfferings,
    serviceOfferings.publicToken,
    generateOfferingToken,
  );
  const authorityIds = await findAuthoritiesForJurisdiction({
    province: canonicalProvince ?? "",
    locality: canonicalLocality ?? "",
  });

  try {
    await db.transaction(async (tx) => {
      await tx.insert(serviceOfferings).values({
        publicToken,
        organizationId: provider.organizationId,
        providerUserId: null,
        jurisdictionProvince: canonicalProvince,
        jurisdictionLocality: canonicalLocality,
        serviceKind: parsed.data.serviceKind,
        displayName: parsed.data.displayName,
        description: parsed.data.description,
        durationMinutes: parsed.data.durationMinutes,
        slotCapacity: parsed.data.slotCapacity,
        priceArs: parsed.data.priceArs?.toString() ?? null,
        eligibilitySpecies: parsed.data.eligibilitySpecies,
        eligibilityAgeMinMonths: parsed.data.eligibilityAgeMinMonths,
        eligibilityAgeMaxMonths: parsed.data.eligibilityAgeMaxMonths,
        status: "pending_approval",
      });

      const providerLabel = provider.organizationDisplayName;

      // Notify applicant.
      const ctaUrl = `/org/${provider.organizationPublicToken}/servicios`;

      await tx.insert(notifications).values({
        userId: actorUserId,
        notificationType: "service_offering_submitted",
        title: "Servicio enviado para revisión",
        body: `"${parsed.data.displayName}" (${kindDef.label}) fue enviado. Te avisamos cuando sea aprobado.`,
        severity: "info",
        ctaLabel: "Ver mis servicios",
        ctaUrl,
      });

      // Fan out to authorities.
      if (authorityIds.length > 0) {
        const roleById = new Map<string, string>();
        for (const id of authorityIds) {
          const [p] = await tx
            .select({ id: profiles.id, role: profiles.role })
            .from(profiles)
            .where(eq(profiles.id, id))
            .limit(1);
          if (p) roleById.set(p.id, p.role);
        }

        await tx.insert(notifications).values(
          authorityIds.map((authorityId) => {
            const role = roleById.get(authorityId) ?? "admin";
            const authCtaUrl = role === "govt" ? "/gob/servicios" : "/admin/servicios";
            return {
              userId: authorityId,
              notificationType: "service_offering_pending_authority",
              title: `Nuevo servicio a aprobar en ${locality || providerLabel}`,
              body: `${providerLabel} solicitó aprobar "${parsed.data.displayName}" (${kindDef.label}).`,
              severity: "info" as const,
              ctaLabel: "Revisar",
              ctaUrl: authCtaUrl,
            };
          }),
        );
      }
    });
  } catch (err) {
    return {
      error: `No se pudo crear la solicitud: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

export async function approveServiceOfferingForAuthority(
  actorUserId: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const [offering] = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.publicToken, publicToken))
    .limit(1);
  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status !== "pending_approval") {
    return { error: `El servicio ya está en estado "${offering.status}".` };
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(serviceOfferings)
        .set({
          status: "approved",
          reviewedAt: now,
          reviewedByUserId: actorUserId,
          updatedAt: now,
        })
        .where(eq(serviceOfferings.id, offering.id));

      // Notify active org members with admin role (they submitted / manage the offering).
      const orgAdmins = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            // biome-ignore lint/style/noNonNullAssertion: org-scoped offering rows always have organizationId.
            eq(organizationMemberships.organizationId, offering.organizationId!),
            isNull(organizationMemberships.leftAt),
          ),
        );

      if (orgAdmins.length > 0) {
        await tx.insert(notifications).values(
          orgAdmins.map((m) => ({
            userId: m.userId,
            notificationType: "service_offering_approved",
            title: `Servicio aprobado: ${offering.displayName}`,
            body: "Ya podés crear la agenda y empezar a recibir reservas.",
            severity: "success" as const,
            ctaLabel: "Gestionar agenda",
            ctaUrl: `/org/${offering.organizationId}/servicios/${publicToken}`,
          })),
        );
      }
    });
  } catch (err) {
    return {
      error: `No se pudo aprobar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

export async function rejectServiceOfferingForAuthority(
  actorUserId: string,
  publicToken: string,
  rejectionReason: string,
): Promise<ServiceOfferingResult> {
  const trimmedReason = rejectionReason.trim();
  if (!trimmedReason || trimmedReason.length < 10) {
    return { error: "El motivo del rechazo debe tener al menos 10 caracteres." };
  }
  if (trimmedReason.length > 1000) {
    return { error: "El motivo del rechazo no puede superar los 1000 caracteres." };
  }

  const [offering] = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.publicToken, publicToken))
    .limit(1);
  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status !== "pending_approval") {
    return { error: `El servicio ya está en estado "${offering.status}".` };
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(serviceOfferings)
        .set({
          status: "rejected",
          reviewedAt: now,
          reviewedByUserId: actorUserId,
          rejectionReason: trimmedReason,
          updatedAt: now,
        })
        .where(eq(serviceOfferings.id, offering.id));

      const orgAdmins = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            // biome-ignore lint/style/noNonNullAssertion: org-scoped offering rows always have organizationId.
            eq(organizationMemberships.organizationId, offering.organizationId!),
            isNull(organizationMemberships.leftAt),
          ),
        );

      if (orgAdmins.length > 0) {
        await tx.insert(notifications).values(
          orgAdmins.map((m) => ({
            userId: m.userId,
            notificationType: "service_offering_rejected",
            title: `Servicio rechazado: ${offering.displayName}`,
            body: `Tu solicitud fue rechazada: ${trimmedReason}`,
            severity: "warning" as const,
            ctaLabel: "Ver mis servicios",
            ctaUrl: `/org/${offering.organizationId}/servicios`,
          })),
        );
      }
    });
  } catch (err) {
    return {
      error: `No se pudo rechazar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true };
}

// ============================================================================
// Form-shaped wrappers — gate auth + capability, delegate to inner writers
// ============================================================================

export type ServiceOfferingFormState = { error: string | null };

export async function createServiceOfferingAction(
  _prev: ServiceOfferingFormState,
  formData: FormData,
): Promise<ServiceOfferingFormState> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // auth.error === null narrows to RequireCapabilitySuccess; all fields non-null.
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const user = auth.user!;
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  const orgToken = organization.publicToken;

  const priceRaw = formData.get("priceArs");
  const priceArs =
    priceRaw !== null && priceRaw !== "" ? Number.parseFloat(String(priceRaw)) : null;

  const durationRaw = formData.get("durationMinutes");
  const durationMinutes = durationRaw !== null ? Number.parseInt(String(durationRaw), 10) : 15;

  const capacityRaw = formData.get("slotCapacity");
  const slotCapacity = capacityRaw !== null ? Number.parseInt(String(capacityRaw), 10) : 1;

  const ageMinRaw = formData.get("eligibilityAgeMinMonths");
  const ageMaxRaw = formData.get("eligibilityAgeMaxMonths");

  const speciesRaw = formData.getAll("eligibilitySpecies");
  const eligibilitySpecies =
    speciesRaw.length > 0
      ? (speciesRaw.map(String).filter((s) => s === "dog" || s === "cat") as ("dog" | "cat")[])
      : null;

  const input = {
    serviceKind: String(formData.get("serviceKind") ?? "").trim(),
    displayName: String(formData.get("displayName") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 15,
    slotCapacity: Number.isFinite(slotCapacity) ? slotCapacity : 1,
    priceArs: priceArs !== null && Number.isFinite(priceArs) ? priceArs : null,
    eligibilitySpecies,
    eligibilityAgeMinMonths:
      ageMinRaw !== null && ageMinRaw !== "" ? Number.parseInt(String(ageMinRaw), 10) : null,
    eligibilityAgeMaxMonths:
      ageMaxRaw !== null && ageMaxRaw !== "" ? Number.parseInt(String(ageMaxRaw), 10) : null,
  };

  const result = await createServiceOfferingForOrg(
    user.id,
    organization.id,
    orgToken,
    organization.displayName,
    organization.jurisdictionProvince,
    organization.jurisdictionLocality,
    input,
  );

  if ("error" in result) return { error: result.error };

  revalidatePath(`/org/${orgToken}/servicios`);
  redirect(`/org/${orgToken}/servicios`);
}

export async function approveServiceOfferingAction(
  publicToken: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role !== "admin" && profile?.role !== "govt") {
    return { error: "Solo admin o govt pueden aprobar servicios." };
  }

  const result = await approveServiceOfferingForAuthority(user.id, publicToken);
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin/servicios");
  revalidatePath("/gob/servicios");
  return { error: null };
}

// ============================================================================
// Org-side lifecycle actions: pause / unpause / archive
// ============================================================================

export async function pauseServiceOfferingAction(
  orgToken: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const [offering] = await db
    .select({ id: serviceOfferings.id, status: serviceOfferings.status })
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.publicToken, publicToken),
        eq(serviceOfferings.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status === "archived") return { error: "No podés pausar un servicio archivado." };
  if (offering.status === "paused") return { error: "El servicio ya está pausado." };

  await db
    .update(serviceOfferings)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(serviceOfferings.id, offering.id));

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${publicToken}`);
  return { ok: true };
}

export async function unpauseServiceOfferingAction(
  orgToken: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const [offering] = await db
    .select({ id: serviceOfferings.id, status: serviceOfferings.status })
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.publicToken, publicToken),
        eq(serviceOfferings.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status !== "paused") return { error: "El servicio no está pausado." };

  await db
    .update(serviceOfferings)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(serviceOfferings.id, offering.id));

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${publicToken}`);
  return { ok: true };
}

export async function archiveServiceOfferingAction(
  orgToken: string,
  publicToken: string,
): Promise<ServiceOfferingResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const [offering] = await db
    .select({ id: serviceOfferings.id, status: serviceOfferings.status })
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.publicToken, publicToken),
        eq(serviceOfferings.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status === "archived") return { error: "El servicio ya está archivado." };

  // Archiving with future confirmed appointments would strand the owners who
  // booked them — they must be attended or cancelled first.
  const [pending] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .where(
      and(
        eq(appointments.serviceOfferingId, offering.id),
        eq(appointments.status, "confirmed"),
        gt(timeSlots.startsAt, new Date()),
      ),
    )
    .limit(1);
  if (pending) {
    return {
      error: "Hay turnos confirmados a futuro para este servicio. Cancelalos antes de eliminarlo.",
    };
  }

  await db
    .update(serviceOfferings)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(serviceOfferings.id, offering.id));

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${publicToken}`);
  return { ok: true };
}

export async function rejectServiceOfferingAction(
  publicToken: string,
  rejectionReason: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (profile?.role !== "admin" && profile?.role !== "govt") {
    return { error: "Solo admin o govt pueden rechazar servicios." };
  }

  const result = await rejectServiceOfferingForAuthority(user.id, publicToken, rejectionReason);
  if ("error" in result) return { error: result.error };

  revalidatePath("/admin/servicios");
  revalidatePath("/gob/servicios");
  return { error: null };
}

// ============================================================================
// Offering capacity update — ARCH-F
// ============================================================================
//
// updateOfferingCapacityWriter: pure inner writer, testable without auth context.
// updateOfferingCapacityAction: org-scoped outer wrapper that gates auth.
//
// Concurrency strategy (matches bookSlotAction D10 pattern):
//   - Open a Drizzle transaction.
//   - Acquire pg_advisory_xact_lock(hashtext(slot_id::text)) on EACH future slot
//     before updating it. This serializes concurrent booking attempts for those
//     slots with concurrent capacity edits.
//   - Re-read each slot inside the lock to get the live bookings_count.
//   - Clamp: never reduce capacity below the slot's current bookings_count.
//     Rationale: the DB CHECK (bookings_count <= capacity) is the final guardrail;
//     setting capacity = bookingsCount when newCapacity < bookingsCount keeps
//     the invariant intact and is the least surprising behavior for org staff —
//     existing bookings are never stranded, and the slot naturally becomes "full".
//   - Only future slots (starts_at > now) are updated; past slots are immutable.
//   - The offering's slotCapacity is also updated in the same transaction so
//     future cron-materialization runs see the correct value.

export type UpdateCapacityResult = { ok: true; slotsUpdated: number } | { error: string };

/**
 * Updates the offering's slotCapacity and syncs all future open/full slots
 * of that offering in one transaction.
 *
 * Invariant: each slot's capacity is set to MAX(newCapacity, slot.bookingsCount).
 * This prevents the DB CHECK (bookings_count <= capacity) from firing while
 * never stranding existing bookings.
 *
 * Past slots (starts_at <= now) are intentionally left untouched.
 *
 * @param offeringId    The internal UUID of the service offering.
 * @param newCapacity   The desired new capacity (must be > 0).
 */
export async function updateOfferingCapacityWriter(
  offeringId: string,
  newCapacity: number,
): Promise<UpdateCapacityResult> {
  if (!Number.isInteger(newCapacity) || newCapacity < 1) {
    return { error: "La capacidad debe ser un número entero mayor a 0." };
  }

  let slotsUpdated = 0;

  try {
    slotsUpdated = await db.transaction(async (tx) => {
      // Capture `now` inside the transaction so it is consistent with the
      // advisory-lock window and any concurrent bookSlotAction reads.
      const now = new Date();
      let count = 0;

      // 1. Update the offering itself so future cron runs use the new value.
      await tx
        .update(serviceOfferings)
        .set({ slotCapacity: newCapacity, updatedAt: now })
        .where(eq(serviceOfferings.id, offeringId));

      // 2. Fetch all future non-cancelled slots for this offering.
      //    We intentionally include 'full' slots — no code path today writes
      //    status='full' (booking reads bookingsCount < capacity, not status).
      //    If a future change starts writing status='full', capacity raises must
      //    also reconcile status back to 'open' where bookingsCount < newCapacity.
      const futureSlots = await tx
        .select({
          id: timeSlots.id,
          bookingsCount: timeSlots.bookingsCount,
        })
        .from(timeSlots)
        .where(
          and(
            eq(timeSlots.serviceOfferingId, offeringId),
            gt(timeSlots.startsAt, now),
            // exclude cancelled slots — they are tombstoned and no longer bookable
            sql`${timeSlots.status} != 'cancelled'`,
          ),
        );

      // 3. For each future slot: acquire advisory lock, then update capacity.
      for (const slot of futureSlots) {
        // Advisory lock — uses Drizzle parameter binding (same pattern as
        // bookSlotAction / blockSlotAction: the driver sends the slot UUID as
        // a bound parameter, and hashtext receives it as text).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${slot.id}))`);

        // Re-read inside the lock to get the authoritative bookings_count.
        const [locked] = await tx
          .select({ bookingsCount: timeSlots.bookingsCount })
          .from(timeSlots)
          .where(eq(timeSlots.id, slot.id))
          .limit(1);

        const bookedCount = locked?.bookingsCount ?? slot.bookingsCount;
        // Clamp: capacity must be at least the current booked count.
        const effectiveCapacity = Math.max(newCapacity, bookedCount);

        await tx
          .update(timeSlots)
          .set({ capacity: effectiveCapacity, updatedAt: now })
          .where(eq(timeSlots.id, slot.id));

        count++;
      }

      return count;
    });
  } catch (err) {
    return {
      error: `No se pudo actualizar la capacidad: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return { ok: true, slotsUpdated };
}

/**
 * Org-scoped server action: updates the capacity of a service offering.
 * The authenticated user must have the service_offering.create capability
 * on the org that owns the offering.
 */
export async function updateOfferingCapacityAction(
  orgToken: string,
  offeringPublicToken: string,
  newCapacity: number,
): Promise<UpdateCapacityResult> {
  const auth = await requireCapability("service_offering.create");
  if (auth.error !== null) return { error: auth.error };
  // biome-ignore lint/style/noNonNullAssertion: narrowed by auth.error === null check above.
  const organization = auth.organization!;

  if (organization.publicToken !== orgToken) {
    return { error: "No tenés acceso a esta organización." };
  }

  const [offering] = await db
    .select({ id: serviceOfferings.id, status: serviceOfferings.status })
    .from(serviceOfferings)
    .where(
      and(
        eq(serviceOfferings.publicToken, offeringPublicToken),
        eq(serviceOfferings.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!offering) return { error: "Servicio no encontrado." };
  if (offering.status === "archived") {
    return { error: "No podés modificar un servicio archivado." };
  }

  const result = await updateOfferingCapacityWriter(offering.id, newCapacity);
  if ("error" in result) return result;

  revalidatePath(`/org/${orgToken}/servicios`);
  revalidatePath(`/org/${orgToken}/servicios/${offeringPublicToken}`);
  revalidatePath(`/org/${orgToken}/servicios/${offeringPublicToken}/agenda`);
  revalidatePath(`/org/${orgToken}/agenda`);
  return result;
}
