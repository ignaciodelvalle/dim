// Authz regression guard — bare inner writers must NOT be exported from
// "use server" files (authz triage verdict 2026-07-04).
//
// Every export of a "use server" module is an independently-addressable
// server action. A bare `*ForUser` / `*ForAuthority` / reader export that
// accepts a caller-supplied userId (or no guard at all) lets any client act
// as any user whose UUID is known — and RLS does NOT back this up, because
// db/index.ts connects with postgres-js (no Supabase JWT), so app-layer
// guards are the only defense.
//
// These are source-level assertions (no DB needed): they fail if someone
// re-exports one of the triaged writers from its "use server" shim. The
// writers themselves still exist in plain application modules, where they are
// not client-addressable.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

function source(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

function exportRegex(name: string): RegExp {
  // Matches `export async function <name>(`, `export function <name>(` and
  // re-export forms `export { <name> }` / `export { x as <name> }`.
  return new RegExp(
    `export\\s+(async\\s+)?function\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`,
  );
}

// file → writer names that must NOT be exported from that "use server" file.
const FORBIDDEN_EXPORTS: Record<string, string[]> = {
  "app/actions/approval-requests.ts": ["withdrawApprovalRequestForUser"],
  "app/actions/microchip.ts": ["replaceMicrochipForUser"],
  "app/actions/dni-verification.ts": ["verifyDniForUser"],
  "app/actions/decomiso.ts": ["resolveGovtOrgForUser"],
  "app/actions/alert-firings.ts": ["recordFiringsForUser"],
  "app/actions/slot-materialization.ts": ["materializeSlotsForOffering"],
  "app/actions/custody-disputes.ts": ["openDisputeFromEvent"],
  "app/actions/amendment.ts": ["fetchLatestAmendmentsForEvents"],
  "app/actions/return-to-owner.ts": [
    "fetchPendingReturnProposalForOwner",
    "fetchPendingOwnerReturnProposalForOrg",
    "loadProposalContext",
    "proposeReturnAsRefugioWriter",
    "proposeReturnAsVecinoWriter",
    "ownerAcceptReturnWriter",
    "ownerRejectReturnWriter",
    "actorCancelProposalWriter",
    "ownerProposeReturnToOrgWriter",
    "orgAcceptOwnerReturnWriter",
    "orgRejectOwnerReturnWriter",
  ],
  "src/modules/organizations/actions.ts": ["updateOrganizationForUser"],
};

describe("bare writers are not exported from 'use server' modules", () => {
  for (const [file, names] of Object.entries(FORBIDDEN_EXPORTS)) {
    for (const name of names) {
      it(`${file} does not export ${name}`, () => {
        const src = source(file);
        // Sanity: these files must still be server-action modules.
        expect(src.startsWith('"use server"')).toBe(true);
        expect(src).not.toMatch(exportRegex(name));
      });
    }
  }
});

describe("uploadRevocationEvidence derives the actor from the session", () => {
  const file = "app/actions/revocation-evidence.ts";

  it("no longer accepts a caller-supplied actorUserId", () => {
    const src = source(file);
    // The exported action's parameter list must not carry an actor id.
    expect(src).not.toMatch(
      /export\s+async\s+function\s+uploadRevocationEvidence\s*\([^)]*actorUserId/s,
    );
    // The action must bind the session inside the "use server" file.
    expect(src).toContain("auth.getUser");
  });
});
