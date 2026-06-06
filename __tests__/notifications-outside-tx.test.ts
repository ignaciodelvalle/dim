// Phase 2.2 (review 2026-05-19 §2.2): notifications must accumulate inside
// the business transaction and be inserted AFTER it commits. A notification
// insert failure must not roll back the user's intent.
//
// This test is a source-level consistency check. It asserts that every file
// refactored in the §2.2 batch follows the canonical pattern:
//
//   type PendingNotification = typeof notifications.$inferInsert;
//   const pendingNotifications: PendingNotification[] = [];
//   ...
//   // inside tx:
//   pendingNotifications.push({ ... });
//   ...
//   // after tx commits:
//   if (pendingNotifications.length > 0) {
//     try {
//       await db.insert(notifications).values(pendingNotifications);
//     } catch (e) {
//       console.error("notifications insert failed ...", e);
//     }
//   }
//
// A runtime failure-mode test (mocked db.insert that throws on the post-tx
// call, asserting the action still returns ok) is a follow-up — running a
// full action end-to-end against a real DB to reach the post-tx point is
// disproportionate for the marginal coverage it adds over this check.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// adoption.ts and adoption-applications.ts were migrated to the hexagonal module
// (src/modules/adoption/actions.ts) in WU-4 of hexagonal-lite-foundation.
// pets.ts was migrated to src/modules/pets/actions.ts in WU-4 of hexagonal-lite-pets.
// foster.ts and foster-proposals.ts were migrated to src/modules/foster/actions.ts
// in WU-4 of hexagonal-lite-foster. The post-tx flush pattern is maintained there via
// the flushNotifications() helper (same contract, different surface).
// All three new files use the flushNotifications() helper pattern (same semantics).
const REFACTORED_FILES = [
  "admin-decisions.ts",
  "admin-institutional.ts",
  "admin-proposals.ts",
  "admin-revocations.ts",
  "bite.ts",
  "chip-match.ts",
  "intake.ts",
  "profile-self-service.ts",
  "return-to-owner.ts",
  "transfer.ts",
  "welfare.ts",
  "welfare-triage.ts",
] as const;

describe("Phase 2.2 — notifications outside transactions (§2.2)", () => {
  for (const file of REFACTORED_FILES) {
    it(`${file} accumulates pendingNotifications and inserts post-tx with try/catch`, () => {
      const src = readFileSync(join(process.cwd(), "app", "actions", file), "utf8");

      expect(src, "declares the local PendingNotification type alias").toMatch(
        /type PendingNotification = typeof notifications\.\$inferInsert/,
      );

      expect(src, "declares a pendingNotifications array typed as PendingNotification[]").toMatch(
        /pendingNotifications\s*:\s*PendingNotification\[\]/,
      );

      expect(src, "pushes notifications into pendingNotifications inside the tx").toMatch(
        /pendingNotifications\.push\(/,
      );

      expect(src, "inserts pendingNotifications with db (not tx) after the tx commits").toMatch(
        /await db\.insert\(notifications\)\.values\(pendingNotifications\)/,
      );

      expect(src, "logs (not throws) when the post-tx notifications insert fails").toMatch(
        /notifications insert failed/,
      );

      expect(
        src,
        "no longer calls tx.insert(notifications) — that's the legacy pattern §2.2 removes",
      ).not.toMatch(/tx\.insert\(notifications\)/);
    });
  }
});
