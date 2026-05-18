"use server";

// Server actions for the service offering approval workflow (Fase 1 + 1.5).
//
// Writer/wrapper split:
//   - Inner writers (createServiceOfferingForOrg, approve*, reject*) are pure
//     DB functions: testable without FormData or Supabase session context.
//   - Wrappers (createServiceOfferingAction, approve*Action, reject*Action) gate
//     auth + capability, then delegate to the inner writer.
//
// Fase 1.5 — approval routing: createServiceOfferingForOrg uses
// findAuthoritiesForJurisdiction to notify the governing govt(s) first,
// falling back to all admins when no govt covers the locality.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  db,
  notifications,
  organizationMemberships,
  profiles,
  serviceOfferings,
} from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { requireCapability } from "@/lib/capabilities";
import { generateOfferingToken } from "@/lib/publicToken";
import { CreateServiceOfferingInput } from "@/lib/scheduling-schemas";
import { findServiceKind } from "@/lib/service-kinds";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// Types
// ============================================================================

export type ServiceOfferingResult = { error: string } | { ok: true };

// ============================================================================
// Inner writers — testable without auth context
// ============================================================================

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
  const parsed = CreateServiceOfferingInput.safeParse(input);
  if (!parsed.success) {
    return { error: "Datos inválidos: " + (parsed.error.issues[0]?.message ?? "error") };
  }

  const kindDef = findServiceKind(parsed.data.serviceKind);
  if (!kindDef) {
    return { error: "Tipo de servicio no reconocido." };
  }

  const publicToken = generateOfferingToken();
  const province = orgProvince ?? "";
  const locality = orgLocality ?? "";

  // Fase 1.5: route notification to governing govt(s); fall back to admins.
  const authorityIds = await findAuthoritiesForJurisdiction({ province, locality });

  try {
    await db.transaction(async (tx) => {
      await tx.insert(serviceOfferings).values({
        publicToken,
        organizationId: orgId,
        jurisdictionProvince: province || null,
        jurisdictionLocality: locality || null,
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

      // Notify applicant
      await tx.insert(notifications).values({
        userId: actorUserId,
        notificationType: "service_offering_submitted",
        title: "Servicio enviado para revisión",
        body: `"${parsed.data.displayName}" (${kindDef.label}) fue enviado. Te avisamos cuando sea aprobado.`,
        severity: "info",
        ctaLabel: "Ver mis servicios",
        ctaUrl: `/org/${orgToken}/servicios`,
      });

      // Fase 1.5: fan out to authorities. Govts get /gob/servicios; admins get /admin/servicios.
      // We need to know whether the resolved IDs are govts or admins to build the right CTA.
      // Simplest approach: query their roles and insert different notification rows per role.
      if (authorityIds.length > 0) {
        const authorityProfiles = await tx
          .select({ id: profiles.id, role: profiles.role })
          .from(profiles)
          .where(
            and(
              // IN clause via Drizzle — use inArray if needed; here we build per-id inserts
              // to avoid the inArray import. The list is small (typically 1–3 users).
              eq(profiles.id, authorityIds[0]),
            ),
          );

        // For authorities beyond the first, fetch individually (list is small in practice).
        // Build a map of id → role.
        const roleById = new Map<string, string>();
        for (const p of authorityProfiles) {
          roleById.set(p.id, p.role);
        }
        // Fetch remaining if any
        for (const id of authorityIds.slice(1)) {
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
            const ctaUrl = role === "govt" ? "/gob/servicios" : "/admin/servicios";
            return {
              userId: authorityId,
              notificationType: "service_offering_pending_authority",
              title: `Nuevo servicio a aprobar en ${locality || orgDisplayName}`,
              body: `${orgDisplayName} solicitó aprobar "${parsed.data.displayName}" (${kindDef.label}).`,
              severity: "info" as const,
              ctaLabel: "Revisar",
              ctaUrl,
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
  const user = auth.user!;
  const organization = auth.organization!;

  const orgToken = organization.publicToken;

  const priceRaw = formData.get("priceArs");
  const priceArs =
    priceRaw !== null && priceRaw !== ""
      ? Number.parseFloat(String(priceRaw))
      : null;

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
      ageMinRaw !== null && ageMinRaw !== ""
        ? Number.parseInt(String(ageMinRaw), 10)
        : null,
    eligibilityAgeMaxMonths:
      ageMaxRaw !== null && ageMaxRaw !== ""
        ? Number.parseInt(String(ageMaxRaw), 10)
        : null,
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
