"use server";

// Owner→Owner transfer handshake (handoff P3-2).
//
// 4 server actions + an expiration helper. Lifecycle:
//
//   initiate  → status='pending'  (current owner creates row)
//   accept    → status='accepted', ownerships transitions, ownership event
//   reject    → status='rejected', no transition
//   cancel    → status='cancelled', no transition (sender only, pending only)
//   expire    → status='expired',  via /api/cron/expire-pet-transfers (7-day)
//
// Email delivery:
//   - If `to_owner_email` matches an existing auth.users row, only the in-app
//     notification fires. Email goes through Supabase Auth's own channels if
//     configured.
//   - If the email is unknown, we call supabase.auth.admin.inviteUserByEmail
//     so the recipient gets a magic-link signup that lands on
//     `/transferencias/<token>/aceptar` after the signup completes.

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  PET_TRANSFER_REASONS,
  type PetTransferReason,
  auditLog,
  db,
  notifications,
  ownerships,
  petEvents,
  petTransfers,
  pets,
  profiles,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { generatePrefixedToken } from "@/lib/publicToken";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type InitiateTransferInput = {
  petToken: string;
  toEmail: string;
  reason: PetTransferReason;
  note?: string | null;
};

export type InitiateTransferResult = { transferToken: string } | { error: string };

export type AcceptTransferResult = { ok: true } | { error: string };

export type RejectTransferInput = { transferToken: string; reason?: string | null };

// ---------------------------------------------------------------------------
// Initiate
// ---------------------------------------------------------------------------

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function initiatePetTransferAction(
  input: InitiateTransferInput,
): Promise<InitiateTransferResult> {
  const { user } = await requireUserOrRedirect();

  const toEmail = input.toEmail.trim().toLowerCase();
  if (!isValidEmail(toEmail)) return { error: "Email inválido." };
  if (!PET_TRANSFER_REASONS.includes(input.reason)) return { error: "Motivo inválido." };

  // Load pet + verify caller is the current owner.
  const [pet] = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      status: pets.status,
      inCustodyDispute: pets.inCustodyDispute,
    })
    .from(pets)
    .where(eq(pets.publicToken, input.petToken))
    .limit(1);
  if (!pet) return { error: "No encontramos la mascota." };
  if (pet.status === "deceased") return { error: "No podés transferir una mascota fallecida." };
  if (pet.status === "lost") {
    return { error: "Esta mascota está reportada como perdida. Resolvé el episodio primero." };
  }
  if (pet.inCustodyDispute) {
    return { error: "Hay una disputa de propiedad abierta. La transferencia se bloquea." };
  }

  const [currentOwnership] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (!currentOwnership || currentOwnership.ownerUserId !== user.id) {
    return { error: "Solo el dueño actual puede iniciar una transferencia." };
  }

  // Look up the recipient by email via the auth admin SDK.
  const admin = createAdminClient();
  let toOwnerId: string | null = null;
  let recipientNeedsInvite = false;
  try {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = list?.users.find((u) => (u.email ?? "").toLowerCase() === toEmail);
    toOwnerId = match?.id ?? null;
  } catch {
    // ignored — we'll just invite by email.
  }
  if (toOwnerId && toOwnerId === user.id) {
    return { error: "No podés transferirte la mascota a vos mismo/a." };
  }
  if (!toOwnerId) {
    recipientNeedsInvite = true;
  }

  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const publicToken = generatePrefixedToken("PTR");
  try {
    await db.insert(petTransfers).values({
      publicToken,
      petId: pet.id,
      fromOwnerId: user.id,
      toOwnerId,
      toOwnerEmail: toEmail,
      status: "pending",
      reason: input.reason,
      note: input.note ?? null,
      expiresAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    if (message.includes("pet_transfers_one_pending_per_pet")) {
      return { error: "Ya hay una transferencia pendiente para esta mascota." };
    }
    return { error: `No se pudo crear la transferencia: ${message}` };
  }

  // Notify the recipient if they already have an account.
  if (toOwnerId) {
    await db.insert(notifications).values({
      userId: toOwnerId,
      notificationType: "pet_transfer_received",
      title: `Te ofrecen la titularidad de ${pet.name}`,
      body: "Recibiste una propuesta de transferencia. Tenés 7 días para aceptar o rechazar.",
      severity: "info",
      relatedPetId: pet.id,
      ctaLabel: "Ver propuesta",
      ctaUrl: `/transferencias/${publicToken}`,
      category: "custody",
    });
  } else if (recipientNeedsInvite) {
    // Magic-link signup invite. Supabase Auth sends the email; our metadata
    // tells the signup page where to land after confirmation.
    try {
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mimar.gob.ar";
      await admin.auth.admin.inviteUserByEmail(toEmail, {
        redirectTo: `${origin}/transferencias/${publicToken}`,
        data: { invited_for: "pet_transfer", transfer_token: publicToken },
      });
    } catch (err) {
      // Non-fatal — the transfer row still exists. Surface only as audit.
      console.error("inviteUserByEmail failed (non-fatal)", err);
    }
  }

  // Confirmation to the sender.
  await db.insert(notifications).values({
    userId: user.id,
    notificationType: "pet_transfer_initiated",
    title: "Transferencia enviada",
    body: `Avisamos a ${toEmail}. Si no responde en ${EXPIRY_DAYS} días la propuesta expira.`,
    severity: "info",
    relatedPetId: pet.id,
    ctaLabel: "Ver propuesta",
    ctaUrl: `/transferencias/${publicToken}`,
    category: "custody",
  });

  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: "pet_transfer_initiated",
    payload: {
      transfer_public_token: publicToken,
      pet_id: pet.id,
      to_email: toEmail,
      to_user_known: !!toOwnerId,
    },
  });

  revalidatePath(`/mis-mascotas/${input.petToken}`);
  return { transferToken: publicToken };
}

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

export async function acceptPetTransferAction(
  transferToken: string,
): Promise<AcceptTransferResult> {
  const { user } = await requireUserOrRedirect();

  const supabase = await createClient();
  const { data: userInfo } = await supabase.auth.getUser();
  const callerEmail = (userInfo?.user?.email ?? "").toLowerCase();

  let resultPetToken = "";
  try {
    await db.transaction(async (tx) => {
      const [transfer] = await tx
        .select()
        .from(petTransfers)
        .where(eq(petTransfers.publicToken, transferToken))
        .limit(1);
      if (!transfer) throw new Error("Transferencia no encontrada.");
      if (transfer.status !== "pending") {
        throw new Error(`La transferencia ya está ${transfer.status}.`);
      }
      if (transfer.expiresAt.getTime() <= Date.now()) {
        throw new Error("La transferencia expiró. Pedile al dueño que la inicie de nuevo.");
      }

      // Caller must match: either toOwnerId already set, or email matches.
      const callerMatchesId = transfer.toOwnerId === user.id;
      const callerMatchesEmail =
        !transfer.toOwnerId && transfer.toOwnerEmail.toLowerCase() === callerEmail;
      if (!callerMatchesId && !callerMatchesEmail) {
        throw new Error("Esta propuesta no es para tu cuenta.");
      }
      if (transfer.fromOwnerId === user.id) {
        throw new Error("No podés aceptar tu propia transferencia.");
      }

      // Resolve pet info inside tx (in case it changed).
      const [pet] = await tx
        .select({
          id: pets.id,
          publicToken: pets.publicToken,
          name: pets.name,
          status: pets.status,
          inCustodyDispute: pets.inCustodyDispute,
        })
        .from(pets)
        .where(eq(pets.id, transfer.petId))
        .limit(1);
      if (!pet) throw new Error("La mascota ya no existe.");
      if (pet.status === "deceased") throw new Error("La mascota figura como fallecida.");
      if (pet.inCustodyDispute) throw new Error("La mascota tiene una disputa abierta.");

      const now = new Date();

      // Close prior owner ownership(s).
      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.role, "owner"),
            isNull(ownerships.endedAt),
          ),
        );

      // Insert new owner ownership.
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerUserId: user.id,
        role: "owner",
        startedAt: now,
      });

      // Append-only event.
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "custody_transferred",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: {
          payload_version: 1,
          from_user_id: transfer.fromOwnerId,
          to_user_id: user.id,
          reason: transfer.reason,
          transfer_token: transferToken,
        },
      });

      // Close the transfer row.
      await tx
        .update(petTransfers)
        .set({ status: "accepted", respondedAt: now, toOwnerId: user.id, updatedAt: now })
        .where(eq(petTransfers.id, transfer.id));

      // Notify the sender.
      await tx.insert(notifications).values({
        userId: transfer.fromOwnerId,
        notificationType: "pet_transfer_accepted",
        title: `Transferencia de ${pet.name} aceptada`,
        body: "El receptor aceptó la propuesta. La mascota ya no figura a tu nombre.",
        severity: "success",
        relatedPetId: pet.id,
        ctaUrl: "/mis-mascotas",
        ctaLabel: "Ver mis mascotas",
        category: "custody",
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "pet_transfer_accepted",
        payload: {
          transfer_public_token: transferToken,
          pet_id: pet.id,
          from_user_id: transfer.fromOwnerId,
        },
      });

      resultPetToken = pet.publicToken;
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }

  if (resultPetToken) revalidatePath(`/mis-mascotas/${resultPetToken}`);
  revalidatePath("/mis-mascotas");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reject
// ---------------------------------------------------------------------------

export async function rejectPetTransferAction(
  input: RejectTransferInput,
): Promise<AcceptTransferResult> {
  const { user } = await requireUserOrRedirect();

  const supabase = await createClient();
  const { data: userInfo } = await supabase.auth.getUser();
  const callerEmail = (userInfo?.user?.email ?? "").toLowerCase();

  try {
    await db.transaction(async (tx) => {
      const [transfer] = await tx
        .select()
        .from(petTransfers)
        .where(eq(petTransfers.publicToken, input.transferToken))
        .limit(1);
      if (!transfer) throw new Error("Transferencia no encontrada.");
      if (transfer.status !== "pending") {
        throw new Error(`La transferencia ya está ${transfer.status}.`);
      }
      const callerMatchesId = transfer.toOwnerId === user.id;
      const callerMatchesEmail =
        !transfer.toOwnerId && transfer.toOwnerEmail.toLowerCase() === callerEmail;
      if (!callerMatchesId && !callerMatchesEmail) {
        throw new Error("Esta propuesta no es para tu cuenta.");
      }

      const now = new Date();
      await tx
        .update(petTransfers)
        .set({
          status: "rejected",
          respondedAt: now,
          rejectionReason: input.reason ?? null,
          toOwnerId: transfer.toOwnerId ?? user.id,
          updatedAt: now,
        })
        .where(eq(petTransfers.id, transfer.id));

      await tx.insert(notifications).values({
        userId: transfer.fromOwnerId,
        notificationType: "pet_transfer_rejected",
        title: "Transferencia rechazada",
        body: input.reason
          ? `El receptor rechazó la propuesta. Motivo: ${input.reason}`
          : "El receptor rechazó la propuesta.",
        severity: "warning",
        relatedPetId: transfer.petId,
        ctaUrl: "/mis-mascotas",
        ctaLabel: "Ver mis mascotas",
        category: "custody",
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "pet_transfer_rejected",
        payload: {
          transfer_public_token: input.transferToken,
          pet_id: transfer.petId,
          reason: input.reason ?? null,
        },
      });
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cancel (sender only, while pending)
// ---------------------------------------------------------------------------

export async function cancelPetTransferAction(
  transferToken: string,
): Promise<AcceptTransferResult> {
  const { user } = await requireUserOrRedirect();

  try {
    await db.transaction(async (tx) => {
      const [transfer] = await tx
        .select()
        .from(petTransfers)
        .where(eq(petTransfers.publicToken, transferToken))
        .limit(1);
      if (!transfer) throw new Error("Transferencia no encontrada.");
      if (transfer.fromOwnerId !== user.id) {
        throw new Error("Solo el emisor puede cancelar la propuesta.");
      }
      if (transfer.status !== "pending") {
        throw new Error(`La transferencia ya está ${transfer.status}.`);
      }

      const now = new Date();
      await tx
        .update(petTransfers)
        .set({ status: "cancelled", respondedAt: now, updatedAt: now })
        .where(eq(petTransfers.id, transfer.id));

      if (transfer.toOwnerId) {
        await tx.insert(notifications).values({
          userId: transfer.toOwnerId,
          notificationType: "pet_transfer_cancelled",
          title: "Transferencia cancelada",
          body: "El emisor canceló la propuesta antes de que respondieras.",
          severity: "info",
          relatedPetId: transfer.petId,
          category: "custody",
        });
      }

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "pet_transfer_cancelled",
        payload: {
          transfer_public_token: transferToken,
          pet_id: transfer.petId,
        },
      });
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error desconocido." };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Expire (cron-only entry point — internal)
// ---------------------------------------------------------------------------

export type ExpirePetTransfersResult = { expired: number };

/**
 * Marks pending transfers whose expires_at is in the past as expired.
 * Per-row notifications to sender. Called from
 * /api/cron/expire-pet-transfers on a daily schedule.
 */
// @no-auth-required: invoked only from /api/cron/expire-pet-transfers, which gates on CRON_SECRET.
export async function expirePetTransfersOnce(): Promise<ExpirePetTransfersResult> {
  const now = new Date();
  const stale = await db
    .select({
      id: petTransfers.id,
      petId: petTransfers.petId,
      fromOwnerId: petTransfers.fromOwnerId,
      publicToken: petTransfers.publicToken,
    })
    .from(petTransfers)
    .where(and(eq(petTransfers.status, "pending"), sql`${petTransfers.expiresAt} < now()`));

  let expired = 0;
  for (const row of stale) {
    try {
      await db
        .update(petTransfers)
        .set({ status: "expired", respondedAt: now, updatedAt: now })
        .where(eq(petTransfers.id, row.id));

      await db.insert(notifications).values({
        userId: row.fromOwnerId,
        notificationType: "pet_transfer_expired",
        title: "Transferencia expirada",
        body: "La propuesta venció sin respuesta. Podés iniciar otra cuando quieras.",
        severity: "warning",
        relatedPetId: row.petId,
        ctaUrl: "/mis-mascotas",
        ctaLabel: "Ver mis mascotas",
        category: "custody",
      });

      await db.insert(auditLog).values({
        actorUserId: row.fromOwnerId,
        action: "pet_transfer_expired",
        payload: { transfer_public_token: row.publicToken, pet_id: row.petId },
      });

      expired += 1;
    } catch (err) {
      console.error("expirePetTransfersOnce row failed", row.id, err);
    }
  }

  return { expired };
}

// ---------------------------------------------------------------------------
// Reader helper (used by the accept-page UI)
// ---------------------------------------------------------------------------

export type TransferViewResult =
  | {
      ok: true;
      transfer: {
        publicToken: string;
        status: PetTransferStatusForView;
        petName: string;
        petToken: string;
        fromDisplayName: string | null;
        toEmail: string;
        reason: PetTransferReason | null;
        note: string | null;
        expiresAt: string;
        isRecipient: boolean;
        isSender: boolean;
      };
    }
  | { ok: false; error: string };

export type PetTransferStatusForView =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export async function getTransferForViewer(transferToken: string): Promise<TransferViewResult> {
  const { user } = await requireUserOrRedirect();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const callerEmail = (data?.user?.email ?? "").toLowerCase();

  const [row] = await db
    .select({
      transfer: petTransfers,
      petName: pets.name,
      petToken: pets.publicToken,
      fromDisplayName: profiles.displayName,
    })
    .from(petTransfers)
    .innerJoin(pets, eq(pets.id, petTransfers.petId))
    .leftJoin(profiles, eq(profiles.id, petTransfers.fromOwnerId))
    .where(eq(petTransfers.publicToken, transferToken))
    .limit(1);

  if (!row) return { ok: false, error: "Transferencia no encontrada." };

  const isSender = row.transfer.fromOwnerId === user.id;
  const isRecipient =
    row.transfer.toOwnerId === user.id ||
    (!row.transfer.toOwnerId && row.transfer.toOwnerEmail.toLowerCase() === callerEmail);

  if (!isSender && !isRecipient) {
    return { ok: false, error: "Esta propuesta no es accesible desde tu cuenta." };
  }

  return {
    ok: true,
    transfer: {
      publicToken: row.transfer.publicToken,
      status: row.transfer.status as PetTransferStatusForView,
      petName: row.petName,
      petToken: row.petToken,
      fromDisplayName: row.fromDisplayName,
      toEmail: row.transfer.toOwnerEmail,
      reason: row.transfer.reason,
      note: row.transfer.note,
      expiresAt: row.transfer.expiresAt.toISOString(),
      isRecipient,
      isSender,
    },
  };
}
