// Capability scope helper for revocation actions.
//
// Mirrors lib/approval-scope.ts canDecideRequest — pure function,
// no DB queries, operates entirely on data passed by the caller.
// Used server-side in each revocation writer and (imported) client-side
// to hide buttons when the actor cannot act.
//
// Spec §REQ-5, design §2e.

import type { AdminOrGovtJurisdiction } from "@/lib/auth-guards";

export type { AdminOrGovtJurisdiction };

export type RevocationType = "vet_role" | "org_verification" | "govt_locality";

// Discriminated union per revocation type. Each variant carries the jurisdiction
// fields needed to evaluate scope — loaded by the caller from the DB before
// calling canRevoke.
export type RevocationTarget =
  | {
      type: "vet_role";
      // Province that issued the vet's professional license.
      // A free-text "Provincia" string from the role_upgrade_vet payload.
      matriculaJurisdiccion: string;
      // Operational address declared by the vet (optional — may not be set).
      operationalProvince?: string | null;
      operationalLocality?: string | null;
    }
  | {
      type: "org_verification";
      province: string;
      locality: string;
    }
  | {
      type: "govt_locality";
      province: string;
      locality: string;
    };

// Authoritative capability check for revocation actions.
//
// - admin: always returns true (universal scope).
// - govt: must hold at least one active jurisdiction assignment that covers
//   the target's scope. The rule varies by revocation type:
//   * org_verification / govt_locality: exact (province, locality) match.
//   * vet_role: OR between matricula_jurisdiccion (province-only) and
//     operational (province, locality). This is intentionally liberal —
//     a govt can revoke a vet if EITHER the vet's license province OR
//     their operational locality falls within the govt's scope.
//     Spec §7.7 — vet scope = matricula jurisdiction OR operational locality.
//
// Does NOT cover the self-revocation footgun for govt_locality — that lives
// in the writer because canRevoke does not receive the actor's user_id.
export function canRevoke(
  profile: { id: string; role: "admin" | "govt" },
  target: RevocationTarget,
  jurisdictions: readonly AdminOrGovtJurisdiction[],
): boolean {
  if (profile.role === "admin") return true;

  if (target.type === "vet_role") {
    // Govt can revoke if the vet's matricula province OR operational locality
    // falls within one of the govt's active assignment (province, locality) pairs.
    return jurisdictions.some(
      (j) =>
        // Province-only match on matricula_jurisdiccion
        j.province === target.matriculaJurisdiccion ||
        // Exact (province, locality) match on operational address
        (target.operationalProvince === j.province &&
          target.operationalLocality === j.locality),
    );
  }

  if (target.type === "org_verification" || target.type === "govt_locality") {
    return jurisdictions.some(
      (j) => j.province === target.province && j.locality === target.locality,
    );
  }

  return false;
}
