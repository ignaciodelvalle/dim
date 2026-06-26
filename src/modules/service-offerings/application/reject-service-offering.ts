// Use-case: rejectServiceOfferingForAuthority
//
// Rejects a pending service offering:
//   1. Validate rejection reason (length guards).
//   2. Load and validate offering state.
//   3. DB transaction:
//      a. UPDATE offering status → rejected, set rejection fields.
//      b. Notify active org members (service_offering_rejected).
//
// Auth guard (admin | govt role check) lives in the action.

import { db, notifications, organizationMemberships, serviceOfferings } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

import type { ServiceOfferingResult } from "../domain/types";

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
