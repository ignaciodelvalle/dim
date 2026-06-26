// Use-case: lookupTransferTargetUseCase
//
// Quick existence + active-state check. The ResolveDisputeForm calls this
// before submitting so the operator sees a human-readable confirmation rather
// than a raw UUID.

import { eq } from "drizzle-orm";

import { db, organizations, profiles } from "@/db";

import type { LookupTransferTargetInput, LookupTransferTargetResult } from "../domain/types";

export async function lookupTransferTargetUseCase(
  input: LookupTransferTargetInput,
): Promise<LookupTransferTargetResult> {
  const id = input.id.trim();
  if (!id) return { found: false, error: "ID vacío." };

  try {
    if (input.kind === "user") {
      const [row] = await db
        .select({ displayName: profiles.displayName, deactivatedAt: profiles.deactivatedAt })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      if (!row) return { found: false, error: "Usuario no encontrado." };
      return {
        found: true,
        displayName: row.displayName ?? id,
        active: row.deactivatedAt === null,
      };
    }
    const [row] = await db
      .select({ displayName: organizations.displayName, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!row) return { found: false, error: "Organización no encontrada." };
    return {
      found: true,
      displayName: row.displayName,
      active: row.status === "active",
    };
  } catch {
    return { found: false, error: "Error al verificar el destino." };
  }
}
