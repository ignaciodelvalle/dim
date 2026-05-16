"use server";

// Custody transfer — org-to-org handoff. The source organization (caller's
// active org) gives up its active ownership row on the pet; the destination
// org gets a fresh ownership row with the chosen role. An active foster row
// is auto-closed and a sibling foster_ended event is emitted in the same tx
// so the timeline reads as one coherent transfer.
//
// Use cases (per AGENTS.md → Custody & adoption + Organizations):
//   - Sanctuary closing — animals move to another refugio
//   - Org-as-permanent-owner needing to rehome later
//   - Inter-org specialization handoffs (surgery refugio → adoption refugio)
//
// Gated on custody.transfer. No receiving-side consent loop in v1 — the
// destination admins get a notification fanout; if they want to reject, the
// follow-up flow is to transfer back. Adding a request/accept handshake is
// a future slice.

import { randomUUID } from "node:crypto";
import {
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { validateEventPayload } from "@/lib/event-schemas";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

export type TransferCustodyFormState = {
  error: string | null;
};

const TRANSFERABLE_SOURCE_ROLES = ["shelter_custody", "owner"] as const;
type TransferableRole = (typeof TRANSFERABLE_SOURCE_ROLES)[number];

export async function transferCustodyAction(
  publicToken: string,
  _previous: TransferCustodyFormState,
  formData: FormData,
): Promise<TransferCustodyFormState> {
  const auth = await requireCapability("custody.transfer");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const destinationOrgId = String(formData.get("destinationOrgId") ?? "").trim();
  const newRoleRaw = String(formData.get("newRole") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!destinationOrgId) return { error: "Falta la organización destino." };
  if (destinationOrgId === organization.id) {
    return { error: "La organización destino no puede ser la misma que la actual." };
  }
  const newRole = (TRANSFERABLE_SOURCE_ROLES as readonly string[]).includes(newRoleRaw)
    ? (newRoleRaw as TransferableRole)
    : "shelter_custody";

  // Pet must be currently held by the source org under a transferable role.
  const [petRow] = await db
    .select({
      pet: pets,
      ownershipId: ownerships.id,
      ownershipRole: ownerships.role,
    })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return { error: "Mascota no encontrada o no está bajo custodia de tu organización." };
  }
  const fromRole = petRow.ownershipRole as string;
  if (!(TRANSFERABLE_SOURCE_ROLES as readonly string[]).includes(fromRole)) {
    return {
      error: `No se puede transferir un registro de rol "${fromRole}". Solo shelter_custody u owner.`,
    };
  }
  const pet = petRow.pet;

  // Destination org must exist AND be verified — protects against typos and
  // against transferring to a half-set-up org that can't actually receive.
  const [destination] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      verified: organizations.verified,
    })
    .from(organizations)
    .where(eq(organizations.id, destinationOrgId))
    .limit(1);
  if (!destination) return { error: "Organización destino no encontrada." };
  if (!destination.verified) {
    return { error: "La organización destino aún no está verificada." };
  }

  // Active foster row, if any, gets auto-closed in the tx with a sibling
  // foster_ended event so the audit trail reads cleanly.
  const [fosterRow] = await db
    .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);

  const now = new Date();
  const authorVerified = organization.verified;
  const fosterEndedEventId = fosterRow ? randomUUID() : null;

  try {
    await db.transaction(async (tx) => {
      // Close source ownership.
      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(eq(ownerships.id, petRow.ownershipId));

      // Close foster (if any) + emit foster_ended event using the upfront UUID
      // so the custody_transferred payload can reference it as
      // foster_ended_event_id without a second update.
      if (fosterRow && fosterEndedEventId) {
        await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, fosterRow.id));
        const fosterEndedPayload = validateEventPayload("foster_ended", {
          foster_user_id: fosterRow.ownerUserId,
          foster_assigned_event_id: null,
          ended_by: "shelter",
          reason: "Transferencia de custodia a otra organización.",
        });
        await tx.insert(petEvents).values({
          id: fosterEndedEventId,
          petId: pet.id,
          eventType: "foster_ended",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "shelter",
          authorOrganizationId: organization.id,
          authorVerified,
          payload: fosterEndedPayload,
        });
      }

      // New ownership row on the destination side. The polymorphic CHECK
      // constraint requires exactly one of owner_user_id / owner_organization_id;
      // we set the org one. The unique-active-owner partial index only fires
      // on role='owner', so role='shelter_custody' transfers are
      // unconditionally safe. role='owner' is safe too because the source
      // owner row was just closed above (same tx, index validates at commit).
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerOrganizationId: destination.id,
        role: newRole,
        startedAt: now,
        transferredFromId: petRow.ownershipId,
      });

      // The transfer event itself. Authored by the source org since they're
      // the ones initiating; destination side sees it via the unified pet
      // timeline (slice 7 cohabitation).
      const transferPayload = validateEventPayload("custody_transferred", {
        from_organization_id: organization.id,
        to_organization_id: destination.id,
        from_role: fromRole as TransferableRole,
        to_role: newRole,
        foster_ended_event_id: fosterEndedEventId,
        notes,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "custody_transferred",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified,
        payload: transferPayload,
      });

      // Fan out to destination admins so they know the pet is now in their
      // org's custody. Matches the capability_request precedent (admins only,
      // not coordinators) — extend the role list later if the receiving
      // refugios want broader visibility.
      const admins = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, destination.id),
            eq(organizationMemberships.role, "admin"),
            isNull(organizationMemberships.leftAt),
          ),
        );
      if (admins.length > 0) {
        await tx.insert(notifications).values(
          admins.map((a) => ({
            userId: a.userId,
            notificationType: "custody_received",
            title: `Recibiste a ${pet.name}`,
            body: `${organization.displayName} transfirió a ${pet.name} a tu organización (${
              newRole === "shelter_custody" ? "custodia temporal" : "dueño permanente"
            }).`,
            severity: "info" as const,
            ctaLabel: "Ver mascota",
            ctaUrl: "/refugio/mascotas",
            relatedPetId: pet.id,
          })),
        );
      }

      // Notify the foster (if any) — heads up that their foster ended
      // because the animal moved orgs.
      if (fosterRow?.ownerUserId) {
        await tx.insert(notifications).values({
          userId: fosterRow.ownerUserId,
          notificationType: "foster_ended_by_transfer",
          title: `${pet.name} cambió de refugio`,
          body: `El tránsito que tenías a cargo se cerró porque ${pet.name} fue transferido a ${destination.displayName}.`,
          severity: "info" as const,
          relatedPetId: pet.id,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo transferir la custodia: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/refugio/mascotas?transferido=${publicToken}`);
}
