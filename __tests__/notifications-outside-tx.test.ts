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
// For action files that emit a single notification (no pending array needed),
// the simpler hardened pattern is:
//
//   try {
//     await db.insert(notifications).values({ ... });
//   } catch (e) {
//     console.error("notifications insert failed ...", e);
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
// transfer.ts (org-to-org handoff), pet-transfer.ts, and cross-org-transfer.ts were
// migrated to src/modules/transfers/actions.ts in WU-4 of hexagonal-lite-transfers.
// All migrated files use the flushNotifications() helper pattern (same semantics).
// welfare.ts and welfare-triage.ts were migrated to src/modules/welfare/actions.ts
// in WU-4 of hexagonal-lite-welfare. The flushNotifications() helper pattern is
// maintained there (same contract, different surface).
// bite.ts was migrated to src/modules/surveillance/actions.ts in WU-5 of
// hexagonal-lite-surveillance. The flushNotifications() helper pattern is maintained
// there (same contract, different surface). app/actions/bite.ts was deleted.
// return-to-owner.ts was migrated to src/modules/return-to-owner/application/* in the
// 2026-06-26 strangler pass. The §2.2 post-tx pattern is preserved per use-case
// (accumulate `pendingNotifications` inside the tx, then `await db.insert(notifications)`
// after the tx commits, wrapped in try/catch logging "notifications insert failed") —
// verified across owner/org propose/accept/reject + cancel use-cases.
// admin-institutional.ts was migrated to
// src/modules/organizations/application/admin-institutional/* in the 2026-06-29
// strangler pass (5/61). The §2.2 post-tx pattern is preserved in each use-case:
//   - create-institutional-account.ts: pendingNotifications[] accumulated inside tx,
//     flushed post-tx with try/catch logging "notifications insert failed".
//   - deactivate-admin.ts: same pattern (pendingNotificationsAdmin[]).
//   - deactivate-govt.ts: same pattern (pendingNotificationsGovt[]).
// The ARCH-P single-insert hardening is preserved in:
//   - reset-institutional-credentials.ts: try/catch wrapping db.insert(notifications).
//   - assign-govt-locality.ts: try/catch wrapping db.insert(notifications).
// app/actions/admin-institutional.ts is now a thin shim — it delegates everything.
const REFACTORED_FILES = [
  "admin-decisions.ts",
  "admin-proposals.ts",
  "admin-revocations.ts",
  "chip-match.ts",
  "intake.ts",
  "profile-self-service.ts",
] as const;

// Files that emit a single notification (no pending array) but must still
// wrap the insert in try/catch so a failure does not propagate to the caller.
// Added in ARCH-P (2026-06-11) to close the gap the §2.2 review identified.
const SINGLE_INSERT_HARDENED_FILES = [
  // admin-institutional.ts migrated to src/modules/organizations/application/admin-institutional/*
  // (strangler 5/61, 2026-06-29). reset-institutional-credentials.ts and assign-govt-locality.ts
  // preserve the try/catch hardening. app/actions/admin-institutional.ts is now a thin shim.
  "profile-self-service.ts", // vetSelfResignForUser
  "public.ts", // notifyOwnerOfFoundPetAction
  "pet-sighting.ts", // reportPetSightingAction
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

describe("ARCH-P — single-insert notification hardening", () => {
  for (const file of SINGLE_INSERT_HARDENED_FILES) {
    it(`${file} wraps every db.insert(notifications) in try/catch with error logging`, () => {
      const src = readFileSync(join(process.cwd(), "app", "actions", file), "utf8");

      // Every bare `await db.insert(notifications)` must be preceded by `try {`
      // within a short window. We verify this by checking that the count of
      // try-guarded inserts equals the total insert count.
      //
      // Strategy: split on `db.insert(notifications)` occurrences and for each
      // check that the immediately-preceding source contains `try {` before the
      // next preceding `} catch` or function boundary.
      //
      // Simpler proxy: assert the file contains at least as many `try {` blocks
      // that immediately guard a notification insert as there are bare inserts.
      // We enforce this via a stricter structural check below.

      // Count total db.insert(notifications) occurrences in the file.
      const totalInserts = (src.match(/db\.insert\(notifications\)/g) ?? []).length;

      // Count occurrences where the insert appears inside a try block.
      // We look for the pattern `try {\n...\n  await db.insert(notifications)`
      // by splitting and checking proximity.
      const segments = src.split(/db\.insert\(notifications\)/);
      let guardedCount = 0;
      for (let i = 0; i < segments.length - 1; i++) {
        const preceding = segments[i];
        // Find the last `try {` before this insert.
        const lastTry = preceding.lastIndexOf("try {");
        const lastCatch = preceding.lastIndexOf("} catch");
        // The insert is guarded if the last `try {` comes after the last `} catch`
        // (meaning we are currently inside an open try block).
        if (lastTry !== -1 && lastTry > lastCatch) {
          guardedCount++;
        }
      }

      expect(
        guardedCount,
        `all ${totalInserts} db.insert(notifications) call(s) in ${file} must be inside a try block`,
      ).toBe(totalInserts);

      // The catch block must log, not silently swallow.
      expect(src, "catch block logs with 'notifications insert failed'").toMatch(
        /notifications insert failed/,
      );
    });
  }
});
