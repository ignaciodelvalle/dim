// Use-case: approveServiceOfferingForAuthority
//
// Approves a pending service offering:
//   1. Load and validate offering state.
//   2. DB transaction:
//      a. UPDATE offering status → approved, set reviewedAt / reviewedByUserId.
//      b. Notify active org members (service_offering_approved).
//
// Auth guard (admin | govt role check) lives in the action.

import { db, notifications, organizationMemberships, serviceOfferings } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

import type { ServiceOfferingResult } from "../domain/types";

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
