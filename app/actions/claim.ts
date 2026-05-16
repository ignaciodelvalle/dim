"use server";

// Stub-profile claim flow. When a refugio finalizes an adoption to a person
// who isn't yet a DIM user, app/actions/adoption.ts creates a `stub profile`
// (no auth.users link) keyed on DNI. The stub holds the new `owner` ownership
// row so the pet's chain of custody stays consistent.
//
// This action lets the real user, after signing up via Supabase Auth, claim
// the stub by DNI: ownership rows transfer from stub.id → real.id, the stub
// row is deleted, and the user's profile takes the DNI. The immutable
// adoption_finalized payload keeps the stub uuid for historical accuracy.

import { db, notifications, ownerships, profiles } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";

export type ClaimFormState = {
  error: string | null;
};

function normalizeDni(input: string): string {
  return input.replace(/\D/g, "");
}

function isValidDni(value: string): boolean {
  return /^\d{7,9}$/.test(value);
}

export async function claimStubProfileAction(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const dniRaw = String(formData.get("dni") ?? "");
  const dni = normalizeDni(dniRaw);
  if (!dni) return { error: "Falta el DNI." };
  if (!isValidDni(dni)) return { error: "DNI inválido (7 a 9 dígitos)." };

  // The current user's own profile (created by the handle_new_user trigger
  // at signup). Verify it doesn't already have a different DNI — claiming
  // overwrites a null DNI but never overrides an existing one.
  const [currentProfile] = await db
    .select({ id: profiles.id, dniNumber: profiles.dniNumber })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (!currentProfile) {
    return {
      error: "No encontramos tu perfil DIM. Volvé a iniciar sesión.",
    };
  }
  if (currentProfile.dniNumber && currentProfile.dniNumber !== dni) {
    return {
      error: "Tu perfil ya tiene un DNI distinto registrado. Contactá soporte si es un error.",
    };
  }

  // The stub: a profile with the same DNI that's NOT the current user. The
  // partial-unique index `profiles_dni_unique_when_present` guarantees at
  // most one match.
  const [stub] = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(and(eq(profiles.dniNumber, dni), ne(profiles.id, user.id)))
    .limit(1);

  if (!stub) {
    // No stub found. If the user's own profile already has the DNI, this is
    // a no-op success. Otherwise it's a genuine miss — no refugio has staged
    // an adoption for them.
    if (currentProfile.dniNumber === dni) {
      return { error: null };
    }
    // Set the DNI on the user's profile anyway — first-time Mi Argentina-
    // style identity binding. Harmless if they're not awaiting a refugio.
    try {
      await db
        .update(profiles)
        .set({ dniNumber: dni, dniVerified: false })
        .where(eq(profiles.id, user.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido.";
      if (message.includes("profiles_dni_unique_when_present")) {
        return { error: "Ese DNI ya está en uso por otro perfil." };
      }
      return { error: `No se pudo guardar el DNI: ${message}` };
    }
    return { error: null };
  }

  // Atomic merge. Order matters:
  //   1. Move ownership rows off the stub onto the real user.
  //   2. Delete the stub profile.
  //   3. Set the DNI on the real user's profile.
  // The partial-unique DNI index allows (2) and (3) to happen in the same
  // transaction because by the time (3) commits, the stub no longer exists.
  let ownershipsMoved = 0;
  try {
    await db.transaction(async (tx) => {
      const moved = await tx
        .update(ownerships)
        .set({ ownerUserId: user.id })
        .where(and(eq(ownerships.ownerUserId, stub.id), isNull(ownerships.endedAt)))
        .returning({ id: ownerships.id });
      ownershipsMoved = moved.length;

      await tx.delete(profiles).where(eq(profiles.id, stub.id));

      await tx
        .update(profiles)
        .set({ dniNumber: dni, dniVerified: false })
        .where(eq(profiles.id, user.id));

      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "stub_profile_claimed",
        title: "Reclamaste tu perfil de adopción",
        body:
          ownershipsMoved === 0
            ? "Vinculamos tu DNI a tu cuenta. No encontramos mascotas pendientes."
            : `Tu perfil quedó vinculado a tu DNI y ${ownershipsMoved} mascota${
                ownershipsMoved === 1 ? "" : "s"
              } ahora figura${ownershipsMoved === 1 ? "" : "n"} en tu libreta.`,
        severity: "success",
        ctaLabel: "Ver mis mascotas",
        ctaUrl: "/mis-mascotas",
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { error: `No se pudo reclamar el perfil: ${message}` };
  }

  redirect(`/mis-mascotas?reclamado=${ownershipsMoved}`);
}
