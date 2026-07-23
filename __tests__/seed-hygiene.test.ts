// DB-backed test for scripts/check-seed-hygiene.ts (plan-maestro-integridad
// C5 — "el seed es ciudadano de primera").
//
// Runs the SAME `findSeedHygieneOffenders` scan the CLI gate + the seed
// scripts' end-of-run check use, against the local Supabase Postgres
// (pnpm db:start). Asserts zero seed-marker hits in any renderable column —
// this is the assertion that actually fails CI when a re-seed regresses,
// independent of anyone remembering to run the CLI script by hand.
//
// Requires the local DB to be up; this file reaches a live Postgres
// connection so vitest's db-reachability partition runs it serially with the
// DB-integration project (see vitest.config.ts).

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  findNotificationHygieneOffenders,
  findSeedHygieneOffenders,
} from "../scripts/check-seed-hygiene";
import { RENDERABLE_TEXT_COLUMNS } from "../scripts/hygiene-rules";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

const sql = postgres(DATABASE_URL, { max: 1, connect_timeout: 5 });

afterAll(async () => {
  await sql.end({ timeout: 1 }).catch(() => {});
});

describe("seed hygiene — renderable columns carry no seed markers", () => {
  it(`is clean across all ${RENDERABLE_TEXT_COLUMNS.length} renderable column(s)`, async () => {
    const offenders = await findSeedHygieneOffenders(sql);

    if (offenders.length > 0) {
      const summary = offenders
        .slice(0, 10)
        .map((o) => `  ${o.table}.${o.column} id=${o.id}: "${o.sample}" (${o.matchedPattern})`)
        .join("\n");
      throw new Error(
        `${offenders.length} seed-hygiene offender(s) found — a renderable column carries a seed-identifiable marker.\n${summary}\n\nRun \`pnpm exec tsx scripts/seed-demo-polish.ts\` to repair, or fix the generator at the source (scripts/seed-panorama.ts).`,
      );
    }

    expect(offenders).toEqual([]);
  });
});

describe("notification hygiene — brand casing + welcome category (migration 0157)", () => {
  it("has 0 wrong-cased brand titles and 0 welcome rows missing a category", async () => {
    const offenders = await findNotificationHygieneOffenders(sql);

    if (offenders.length > 0) {
      const summary = offenders
        .slice(0, 10)
        .map((o) => `  id=${o.id}: ${o.issue} — "${o.sample}"`)
        .join("\n");
      throw new Error(
        `${offenders.length} notification-hygiene offender(s) found.\n${summary}\n\nSee db/migrations/0157_welcome_notification_category_and_casing.sql for the repair pattern.`,
      );
    }

    expect(offenders).toEqual([]);
  });
});
