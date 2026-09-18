// Subject-rights coverage CI gate — Ley 25.326 arts. 14 + 16.
//
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// AGENTS.md §6b and §7 wrote the diagnosis before this file was written:
// "nada vincula hoy las tablas con `pii.apply_baseline` a los dos RPC, la
// cobertura se escribe a mano tabla por tabla, así que esta clase de omisión es
// invisible para CI y va a repetirse." It had already repeated — `pet_tags`
// (0169) needed 0170 to catch up, `pet_caretaker_grants` (0189) and
// `foster_volunteers` sat in NEITHER function until 0205, and `push_subscriptions`
// was DELETED by art. 16 while art. 14 never returned it, so the subject could
// not see what was about to be destroyed.
//
// This fence makes the omission a red CI instead of an audit finding: every
// table in the public schema carries a classification of BOTH rights — its
// art. 14 side (export) and its art. 16 side (erase) — and every side that says
// "covered" is verified BOTH WAYS against the live function bodies.
//
// WHAT IT PROVES, AND — SAID PLAINLY — WHAT IT DOES NOT
// ---------------------------------------------------------------------------
// It proves MENTION, not predicate correctness. A table can be named in
// `export_subject_data` with a WHERE clause that matches the wrong subject, or
// scrubbed in `erase_subject_data` on a predicate that misses half the rows,
// and this fence will pass it. That limit is structural: `pg_get_functiondef`
// hands back text, and deciding whether a predicate is the RIGHT one is what
// the integration tests in __tests__/subject-rights-*.test.ts do against real
// rows. Do not read a green line here as "the RPCs are correct". Read it as
// "no table is silently absent, and no declared table has silently fallen out".
//
// WHY THE LIST IS NOT DERIVED FROM pii.apply_baseline
// ---------------------------------------------------------------------------
// That was the obvious idea and it is not honest. Only SIX tables are under the
// baseline (profiles, pets, pet_identifications, custody_disputes, pet_tags,
// pet_caretaker_grants — migrations 0058/0169/0189), while the RPCs already
// reach twenty-three. Deriving from the baseline would declare seventeen
// covered tables out of scope and call the result coverage.
//
// EVERY NUMBER IN THIS HEADER IS FENCED, and that is new. It said "eighteen"
// and "twelve" — the arithmetic was consistent with itself and both halves were
// stale, which is the failure mode a lone reader cannot catch. The counts are
// derivable from the classification BELOW IN THIS SAME FILE, so
// __tests__/documented-subject-rights-counts.test.ts flows this comment block
// into prose and asserts each word against the list it describes. Correct the
// list and this header goes red until it agrees; there is no longer a version
// of this file where the prose and the data disagree in silence.
//
// ONE CLASSIFICATION PER SIDE, NOT ONE PER TABLE (A05-2, 2026-09)
// ---------------------------------------------------------------------------
// The first version sorted TABLES into four lists, and a table named by ONE RPC
// landed in IN_EXPORT or IN_ERASE and was counted as covered — the missing half
// had no place to be written down. Five tables sat like that
// (organization_memberships and custody_disputes export-only, case_events and
// libreta_share_tokens erase-only, pet_identifications erased from TypeScript),
// and `attachments` was filed as EXEMPT while it holds files the subject
// uploaded. So CLASSIFICATION below states each side separately, as one of:
//   covered — the table is named in that function's live body. Verified in
//     both directions.
//   covered_outside_sql(where, reason) — reached by a named TypeScript step of
//     the erasure, because SQL cannot (object storage, event-backed releases).
//     The fence checks the named function exists in the named file.
//   exempt(reason) — this side holds no personal data of a natural person
//     beyond an opaque actor FK recording who performed an official act.
//   gap(reason) — this side DOES hold subject data and the right does not
//     reach it.
// A side left out, or carrying an empty reason, is a violation — not a default.
//
// IN_EXPORT, IN_ERASE, EXEMPT and KNOWN_GAP are still exported, DERIVED from
// that one table: a list is the tables whose side(s) say so, and EXEMPT /
// KNOWN_GAP hold only tables where BOTH sides agree.
//
// WHY "gap" EXISTS AT ALL
// ---------------------------------------------------------------------------
// The gap state is the point. A design without it forces every uncovered
// table into EXEMPT, and there are seventeen tables here that hold real
// subject data the RPCs do not touch. Writing "exempt" next to each of them
// would be seventeen false statements in the one file whose whole job is to
// stop a false statement about coverage. KNOWN_GAP names the debt, prints it on
// every run, and still fails on a table with no classification — so the NEXT
// pet_caretaker_grants cannot arrive unnoticed, and the existing ones cannot be
// laundered into "reviewed and fine".
//
// The count is prose and it drifted twice: it read "twenty-one" while the list
// held 20 (0207 closed libreta_share_tokens and only the test ceiling was
// lowered), and AGENTS.md §6b was still reading "21" on 2026-08-29, forty-six
// lines above a §7 that already said 17. 0208 closed operator_feed_watermarks,
// physical_tag_interest and organization_invitations, so it is seventeen. The
// number the CI line prints has always been computed from the list; what used
// to be maintained by hand — these sentences — is now fenced against it too.
//
// Moving a side OUT of gap is done by adding the table to that function, not by
// editing this file alone: check 4 fails a non-covered side whose live body
// mentions the table, and check 3 fails a covered side whose body does not.
//
// WHICH DATABASE — this fence skips, loudly
// ---------------------------------------------------------------------------
// Same contract as lint:rls, lint:scope-authz and lint:spine (scripts/_db-target.ts):
// a non-local host is a SKIP unless --allow-remote was typed, and an
// unreachable database is a SKIP that says it proved nothing. Silence is never
// the answer, and a DB-less CI box is not a pass.
//
// Run:  pnpm tsx scripts/check-subject-rights-coverage.ts   (or: pnpm lint:subject-rights)
// Exits 0 when every table is classified and both directions hold, and when the
//   run was skipped.
// Exits 1 listing each violation.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import postgres from "postgres";

import {
  DEFAULT_LOCAL_URL,
  type DbTarget,
  describeTarget,
  lines,
  remoteRemedy,
  remoteSkipReason,
  reportSkip as reportDbSkip,
} from "./_db-target";

const SKIPPED_CHECKS =
  "  NOT RUN: subject-rights per-side classification, and the two-way check of\n" +
  "  export_subject_data / erase_subject_data against their declared tables.";

/** Where a `covered_outside_sql` side is reached: a file and a function in it. */
export type OutsideSqlSite = { readonly file: string; readonly fn: string };

/** How ONE right (art. 14 export, or art. 16 erase) treats ONE table. */
export type Side =
  | { readonly state: "covered" }
  | {
      readonly state: "covered_outside_sql";
      readonly where: OutsideSqlSite;
      readonly reason: string;
    }
  | { readonly state: "exempt"; readonly reason: string }
  | { readonly state: "gap"; readonly reason: string };

export type Classification = { readonly export: Side; readonly erase: Side };

const covered: Side = { state: "covered" };
const exempt = (reason: string): Side => ({ state: "exempt", reason });
const gap = (reason: string): Side => ({ state: "gap", reason });

/** Named in BOTH live bodies. */
const BOTH_COVERED: Classification = { export: covered, erase: covered };
/** No personal data on either side — one reason serves both. */
const bothExempt = (reason: string): Classification => ({
  export: exempt(reason),
  erase: exempt(reason),
});
/** Subject data neither right reaches — one reason serves both. */
const bothGap = (reason: string): Classification => ({ export: gap(reason), erase: gap(reason) });

const ERASE_TS = "src/modules/auth/application/subject-rights/erase-subject-data.ts";

/**
 * THE classification — every public table, each right stated on its own.
 *
 * Exempt actor FKs are deliberately out of scope: the accountability trail they
 * form is the thing art. 16 may NOT erase, and `audit_log` — which both RPCs
 * already reach — is its canonical instrument.
 */
export const CLASSIFICATION: Readonly<Record<string, Classification>> = {
  _dim_migrations: bothExempt("Migration ledger: filename, checksum, applied_at. No person."),
  alert_firings: bothGap("Free-text `notes` written by a govt operator while working an alert."),
  alert_subscriptions: bothGap("The subject's own alert `label` and thresholds (actor_user_id)."),
  appointments: bothGap(
    "owner_user_id plus `notes_from_owner`, `notes_from_org`, `cancellation_reason`.",
  ),
  approval_requests: bothGap(
    "applicant_user_id / target_user_id, a free-form `payload` jsonb and `decision_notes`.",
  ),
  ar_localities: bothExempt("INDEC locality catalogue. Public reference data."),
  ar_localities_import_runs: bothExempt("Telemetry for the locality catalogue import job."),
  // Was EXEMPT until A05-2 — wrongly: a row names the uploader and carries the
  // caption they typed. Each side is now stated for what it is.
  attachments: {
    export: gap(
      "export_subject_data returns no attachments section: the subject cannot see, under art. 14, the rows (uploaded_by_user_id, caption, storage_path, mime_type) describing files they uploaded.",
    ),
    erase: {
      state: "covered_outside_sql",
      where: { file: ERASE_TS, fn: "purgeOwnedPetAttachments" },
      reason:
        "Deletes the storage object AND the row for every pet the subject owns. It cannot move into the RPC — SQL has no object-store access, so deleting the row there would orphan the file. RESIDUAL, stated rather than hidden: an attachment the subject uploaded onto SOMEBODY ELSE'S pet is not reached.",
    },
  },
  audit_log: BOTH_COVERED,
  // 0130/0208: erase redacts the subject's own reporter_comment notes; the export
  // has never returned a case_events section.
  case_events: {
    export: gap(
      "export_subject_data has no case_events section, so the reporter_comment notes art. 16 redacts are never shown to the subject under art. 14.",
    ),
    erase: covered,
  },
  cases: bothGap(
    "applicant_user_id and the free-text `opened_reason`; the shell around case_events.",
  ),
  cron_runs: bothExempt("Cron telemetry. Drained on a 90-day TTL by runDataLifecyclePurge."),
  custody_dispute_parties: BOTH_COVERED,
  custody_disputes: {
    export: covered,
    erase: exempt(
      "The dispute shell is an official record: jurisdiction, status, the authority's resolution_summary. The subject's own words live in custody_dispute_parties (redacted there); raised_by_user_id / resolved_by_user_id are actor FKs of official acts.",
    ),
  },
  eno_processing_queue: bothExempt(
    "Work queue keyed on pet_event_id — status, retries, last error.",
  ),
  event_notification_outbox: bothGap(
    "`payload_snapshot` carries a copy of the source event's payload.",
  ),
  foster_proposals: bothGap(
    "volunteer_user_id plus `proposed_notes`, `response_notes`, `cancellation_reason` — free text about the volunteer.",
  ),
  foster_volunteers: BOTH_COVERED,
  govt_assignments: bothGap("The subject's official assignment, `revocation_reason` and `notes`."),
  govt_business_rules: bothGap("Operator `notes` and the created_by / updated_by actor pair."),
  jurisdictions_census: bothExempt("Published census figures per jurisdiction."),
  // 0207: the erasure revokes the subject's outstanding libreta shares (their
  // own grants of access die with the account).
  libreta_share_tokens: {
    export: gap(
      "export_subject_data does not return the share rows, so the `label` the user typed and the shares art. 16 revokes are never shown under art. 14.",
    ),
    erase: covered,
  },
  notification_dead_letter: bothGap(
    "The undelivered notification's `payload` — its title and body.",
  ),
  notifications: BOTH_COVERED,
  // 0208: the watermark row is DELETED (user_id is its PK — it cannot exist
  // without naming the subject), and the export returns it first so art. 14
  // shows what art. 16 is about to destroy.
  operator_feed_watermarks: BOTH_COVERED,
  org_contact_messages: BOTH_COVERED,
  organization_capability_grants: bothGap("`requested_reason` and `decision_reason` free text."),
  organization_coverage: bothExempt("An organization's declared coverage zones."),
  // 0208: REDACTED, not deleted. The invitee email is sentinelled and
  // outstanding invitations are revoked on both sides, while the actor FKs and
  // the accepted rows stay — an accepted invitation is the provenance of an
  // organization membership, and that trail is not the subject's alone.
  organization_invitations: BOTH_COVERED,
  // ERRATA #2 in erase-subject-data.ts: never read by erase_subject_data, despite
  // 0208's header claiming "both RPCs since 0059".
  organization_memberships: {
    export: covered,
    erase: gap(
      "erase_subject_data never reads it: the subject's membership rows stay live with their `title`. Closing it (`left_at = now()`, `title = NULL`) is an open art. 16 item.",
    ),
  },
  organizations: bothGap(
    "A legal entity, but `email` / `phone` may be a natural person's for a one-person org, and created_by / verified_by are actor FKs.",
  ),
  ownerships: BOTH_COVERED,
  panorama_cube: bothExempt("k-anonymised aggregate (k=5, AGENTS.md §6). No row is a person."),
  panorama_cube_meta: bothExempt("Build metadata for panorama_cube — timestamps and row counts."),
  panorama_kpi_cube: bothExempt("k-anonymised KPI aggregate (k=5). No row is a person."),
  panorama_kpi_cube_meta: bothExempt("Build metadata for panorama_kpi_cube."),
  pet_achievement_views: bothGap(
    "One row per (user, pet, achievement) — a per-user reading record.",
  ),
  pet_caretaker_grants: BOTH_COVERED,
  pet_events: BOTH_COVERED,
  pet_identifications: {
    export: covered,
    erase: {
      state: "covered_outside_sql",
      where: { file: ERASE_TS, fn: "releaseMicrochipsForErasedPets" },
      reason:
        "Every active chip of a pet the erasure suppressed is released through a microchip_replaced event (the table is canonical and event-backed, so a bare UPDATE in SQL would leave replay drift). The row describes the animal; releasing it is what frees the chip for re-registration.",
    },
  },
  pet_service_dog: bothGap(
    "Credential fields and `notes`, plus verified_by / revoked_by actor FKs.",
  ),
  pet_tags: BOTH_COVERED,
  pet_transfers: BOTH_COVERED,
  pets: BOTH_COVERED,
  // 0208: DELETED. `user_id` is NOT NULL, so the row cannot be anonymised in
  // place — a demand signal is not a lawful basis for keeping a named row.
  physical_tag_interest: BOTH_COVERED,
  profiles: BOTH_COVERED,
  push_subscriptions: BOTH_COVERED,
  // Native (Expo) push destinations (migration 0222). Exported MINUS
  // `expo_push_token`: an Expo token has no second factor and IS the deliverable
  // address, so returning it would put a live delivery credential into a file
  // the subject may forward. Erased outright on the push_subscriptions
  // precedent: every column is the subject's own.
  push_targets: BOTH_COVERED,
  rate_limit_buckets: bothExempt(
    "Abuse-prevention counters on a short-lived cohort key, drained every run by runDataLifecyclePurge. A security control's live window is not what art. 16 reaches, and the row expires on its own.",
  ),
  reminders: bothGap("user_id plus the reminder's `title` and `description`."),
  service_offerings: bothGap(
    "provider_user_id — a natural person can be the provider — and `description`.",
  ),
  service_schedule_rules: bothExempt("Opening hours of a service offering. No person."),
  time_slots: bothExempt("Capacity counters on a service offering. No person."),
  welfare_report_attachments: bothGap("uploaded_by_user_id and `original_filename`."),
  welfare_reports: BOTH_COVERED,
};

const TABLES = Object.keys(CLASSIFICATION).sort();

function tablesWhere(pred: (c: Classification) => boolean): string[] {
  return TABLES.filter((t) => pred(CLASSIFICATION[t]));
}

function sideReason(side: Side): string {
  return side.state === "covered" ? "" : side.reason;
}

/** Tables `export_subject_data` names — its `covered` export sides. Derived. */
export const IN_EXPORT: readonly string[] = tablesWhere((c) => c.export.state === "covered");

/** Tables `erase_subject_data` names — its `covered` erase sides. Derived. */
export const IN_ERASE: readonly string[] = tablesWhere((c) => c.erase.state === "covered");

function bothSidesAre(state: "exempt" | "gap"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tablesWhere((c) => c.export.state === state && c.erase.state === state)) {
    const { export: ex, erase: er } = CLASSIFICATION[t];
    const a = sideReason(ex);
    const b = sideReason(er);
    out[t] = a === b ? a : `export: ${a} / erase: ${b}`;
  }
  return out;
}

/** Tables with no personal data on EITHER side. Derived. */
export const EXEMPT: Record<string, string> = bothSidesAre("exempt");

/**
 * Tables that hold subject data that NEITHER right reaches — the two-sided debt
 * register. One-sided gaps are listed by `sideGaps()`, not here. Derived.
 */
export const KNOWN_GAP: Record<string, string> = bothSidesAre("gap");

/** Every side in `gap`, per right — one-sided gaps included. */
export function sideGaps(
  classification: Readonly<Record<string, Classification>> = CLASSIFICATION,
): { export: string[]; erase: string[] } {
  const keys = Object.keys(classification).sort();
  return {
    export: keys.filter((t) => classification[t].export?.state === "gap"),
    erase: keys.filter((t) => classification[t].erase?.state === "gap"),
  };
}

type Violation = { kind: string; message: string };

type FunctionDefRow = { proname: string; def: string };
type TableRow = { tablename: string };

/** Reads a repo-relative source file, or null when absent. Injectable for tests. */
export type SourceReader = (repoRelativePath: string) => string | null;

const REPO_ROOT = resolve(import.meta.dirname, "..");

export const readRepoSource: SourceReader = (p) => {
  const abs = join(REPO_ROOT, p);
  return existsSync(abs) ? readFileSync(abs, "utf8") : null;
};

/**
 * Does the function body name this table? Matched as `public.<name>` with a
 * word boundary, never as a bare substring: `pets` would otherwise match
 * nothing useful and a future `pet_event_notes` would match `pet_events`. Both
 * RPCs schema-qualify every table reference, which is what makes this exact.
 */
export function bodyMentions(def: string, table: string): boolean {
  return new RegExp(`\\bpublic\\.${table}\\b`).test(def);
}

const STATES = new Set(["covered", "covered_outside_sql", "exempt", "gap"]);

/** A reason short enough to be a placeholder is not a written reason. */
export const MIN_REASON_LENGTH = 20;

/**
 * Check 1 — every live table has an entry, and every entry states BOTH sides
 * with a known state and, off `covered`, a written reason. The type system
 * already refuses a missing side at compile time; this is the runtime half, for
 * a classification that reaches `evaluate` through a cast or a test.
 */
function checkClassification(
  tables: readonly string[],
  classification: Readonly<Record<string, Classification>>,
): Violation[] {
  const violations: Violation[] = [];
  for (const t of tables) {
    const c = classification[t];
    if (c === undefined) {
      violations.push({
        kind: "unclassified",
        message: `✗ ${t} — has NO classification. A new public table must be declared in CLASSIFICATION (scripts/check-subject-rights-coverage.ts) with BOTH its export (art. 14) and erase (art. 16) side stated: covered (named in that RPC), covered_outside_sql, exempt (no personal data of a natural person) or gap (subject data the right does not reach), each non-covered side with a written reason. This is the check that pet_caretaker_grants needed and did not have.`,
      });
      continue;
    }
    for (const right of ["export", "erase"] as const) {
      const side = (c as Partial<Classification>)[right];
      if (side === undefined || !STATES.has((side as { state?: string }).state ?? "")) {
        violations.push({
          kind: "unclassified_side",
          message: `✗ ${t} — its ${right} side is ${side === undefined ? "not stated" : `an unknown state (${JSON.stringify(side)})`}. Every table states both rights; there is no default.`,
        });
        continue;
      }
      if (side.state !== "covered" && (side.reason ?? "").trim().length < MIN_REASON_LENGTH) {
        violations.push({
          kind: "unreasoned_side",
          message: `✗ ${t} — its ${right} side is ${side.state} with no written reason (under ${MIN_REASON_LENGTH} characters). Say what the table holds and why this right does or does not reach it.`,
        });
      }
    }
  }
  return violations;
}

/** Check 2 — no stale entry: a classified table that no longer exists. */
function checkStaleEntries(
  live: ReadonlySet<string>,
  classification: Readonly<Record<string, Classification>>,
): Violation[] {
  return Object.keys(classification)
    .filter((t) => !live.has(t))
    .map((t) => ({
      kind: "stale",
      message: `✗ ${t} — classified but no such table exists in the public schema. Remove the entry.`,
    }));
}

const RIGHTS = [
  ["export", "export_subject_data"],
  ["erase", "erase_subject_data"],
] as const;

/**
 * Check 3 — forward direction: a `covered` side must actually be in the live
 * body. Catches a future CREATE OR REPLACE that drops a section, and catches a
 * hand-patched environment whose function does not match the migrations.
 */
function checkForwardDirection(
  live: ReadonlySet<string>,
  classification: Readonly<Record<string, Classification>>,
  defs: { export: string; erase: string },
): Violation[] {
  const violations: Violation[] = [];
  for (const [right, fn] of RIGHTS) {
    for (const [t, c] of Object.entries(classification)) {
      if (!live.has(t) || c[right]?.state !== "covered") continue;
      if (!bodyMentions(defs[right], t)) {
        violations.push({
          kind: "missing_from_function",
          message: `✗ ${t} — its ${right} side is declared covered but the LIVE ${fn} body never names public.${t}. Either a replace dropped the section, or this database was not migrated.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Check 4 — reverse direction, PER SIDE: a side that is not `covered` must not
 * be named by that side's body. This is what makes closing a gap a one-way
 * door — you cannot add a table to a function and leave that side sitting in
 * the debt register — and, since A05-2, it holds for each right separately.
 */
function checkReverseDirection(
  live: ReadonlySet<string>,
  classification: Readonly<Record<string, Classification>>,
  defs: { export: string; erase: string },
): Violation[] {
  const violations: Violation[] = [];
  for (const [right, fn] of RIGHTS) {
    for (const [t, c] of Object.entries(classification)) {
      const side = c[right];
      if (!live.has(t) || side === undefined || side.state === "covered") continue;
      if (bodyMentions(defs[right], t)) {
        violations.push({
          kind: "covered_but_listed_uncovered",
          message: `✗ ${t} — its ${right} side is declared ${side.state} but ${fn} names public.${t}. Declare that side covered.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Check 5 — a `covered_outside_sql` side names a function that exists. The
 * claim "TypeScript reaches it" is otherwise a sentence; this makes it a
 * pointer that goes red when the function is renamed or removed.
 */
function checkOutsideSqlSites(
  classification: Readonly<Record<string, Classification>>,
  readSource: SourceReader,
): Violation[] {
  const violations: Violation[] = [];
  for (const [t, c] of Object.entries(classification)) {
    for (const right of ["export", "erase"] as const) {
      const side = c[right];
      if (side?.state !== "covered_outside_sql") continue;
      const src = readSource(side.where.file);
      const declared =
        src !== null && new RegExp(`\\bfunction\\s+${side.where.fn}\\s*\\(`).test(src);
      if (!declared) {
        violations.push({
          kind: "outside_sql_site_missing",
          message: `✗ ${t} — its ${right} side is covered_outside_sql by ${side.where.file}::${side.where.fn}, and ${src === null ? "that file does not exist" : "that file declares no such function"}. Point it at the step that actually reaches the table, or declare the side a gap.`,
        });
      }
    }
  }
  return violations;
}

export function evaluate(
  tables: readonly string[],
  exportDef: string,
  eraseDef: string,
  classification: Readonly<Record<string, Classification>> = CLASSIFICATION,
  readSource: SourceReader = readRepoSource,
): { violations: Violation[]; gapCount: number } {
  const live = new Set(tables);
  const defs = { export: exportDef, erase: eraseDef };
  return {
    violations: [
      ...checkClassification(tables, classification),
      ...checkStaleEntries(live, classification),
      ...checkForwardDirection(live, classification, defs),
      ...checkReverseDirection(live, classification, defs),
      ...checkOutsideSqlSites(classification, readSource),
    ],
    gapCount: Object.keys(KNOWN_GAP).filter((t) => live.has(t)).length,
  };
}

async function fetchCatalog(
  rawUrl: string,
  target: DbTarget,
): Promise<{ tables: string[]; exportDef: string; eraseDef: string } | null> {
  const sql = postgres(rawUrl, { max: 1, connect_timeout: 5 });
  try {
    const tableRows = (await sql`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `) as unknown as TableRow[];
    const defRows = (await sql`
      SELECT p.proname, pg_get_functiondef(p.oid) AS def
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('export_subject_data', 'erase_subject_data')
    `) as unknown as FunctionDefRow[];

    const exportDef = defRows.find((r) => r.proname === "export_subject_data")?.def;
    const eraseDef = defRows.find((r) => r.proname === "erase_subject_data")?.def;
    if (exportDef === undefined || eraseDef === undefined) {
      // Not a skip: the database answered, and the answer is that a function
      // governing a legal right is missing.
      console.error(
        lines(
          "✗ check-subject-rights-coverage: a subject-rights RPC is MISSING from this database.",
          `  export_subject_data: ${exportDef === undefined ? "NOT FOUND" : "present"}`,
          `  erase_subject_data:  ${eraseDef === undefined ? "NOT FOUND" : "present"}`,
          `  Database: ${target.label}`,
          "  Run pnpm db:migrate. These functions answer Ley 25.326 arts. 14 and 16.",
        ),
      );
      process.exit(1);
    }
    return { tables: tableRows.map((r) => r.tablename), exportDef, eraseDef };
  } catch (err) {
    reportDbSkip({
      fence: "check-subject-rights-coverage",
      reason: `could not reach the database (${err instanceof Error ? err.message : String(err)}).`,
      target,
      skipped: SKIPPED_CHECKS,
      remedy: lines(
        "  Start the local stack with pnpm db:start, or set DATABASE_URL to a reachable database.",
        "  A DB-less CI box is not a failure — but this run proved nothing about subject-rights coverage.",
      ),
    });
    return null;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

export async function runCheck(argv: string[] = []): Promise<void> {
  const allowRemote = argv.includes("--allow-remote");
  const rawUrl = process.env.DATABASE_URL ?? DEFAULT_LOCAL_URL;
  const usingDefault = process.env.DATABASE_URL === undefined;
  const target = describeTarget(rawUrl);

  const remoteSkip = remoteSkipReason(target, allowRemote);
  if (remoteSkip !== null) {
    reportDbSkip({
      fence: "check-subject-rights-coverage",
      reason: remoteSkip,
      target,
      skipped: SKIPPED_CHECKS,
      remedy: remoteRemedy("SELECTs pg_tables / pg_get_functiondef"),
    });
    return;
  }

  const fetched = await fetchCatalog(rawUrl, target);
  if (fetched === null) return;

  const origin = usingDefault ? "default local URL" : "DATABASE_URL";
  const remoteNote = target.isLocal ? "" : " [REMOTE — --allow-remote]";
  const dbLine = `  Database: ${target.label} (from ${origin})${remoteNote}`;

  const { violations, gapCount } = evaluate(fetched.tables, fetched.exportDef, fetched.eraseDef);

  if (violations.length > 0) {
    for (const v of violations) console.error(v.message);
    console.error(
      lines(
        "",
        `✗ Subject-rights coverage check FAILED — ${violations.length} violation(s) across ${fetched.tables.length} public tables.`,
        dbLine,
      ),
    );
    process.exit(1);
  }

  const coveredCount = new Set([...IN_EXPORT, ...IN_ERASE]).size;
  console.log(
    `✓ Subject-rights coverage clean — ${fetched.tables.length} public tables classified; ` +
      `${coveredCount} reached by a subject-rights RPC (${IN_EXPORT.length} in export, ${IN_ERASE.length} in erase); ` +
      `${Object.keys(EXEMPT).length} exempt; ${gapCount} declared KNOWN_GAP.`,
  );
  console.log(
    "  This proves MENTION, not predicate correctness — a table can be named with the wrong WHERE clause and pass here.",
  );
  console.log(
    `  Open art. 14 / art. 16 debt (${gapCount} tables): ${Object.keys(KNOWN_GAP).join(", ")}.`,
  );
  const oneSided = sideGaps();
  const exportOnlyGaps = oneSided.export.filter((t) => !Object.hasOwn(KNOWN_GAP, t));
  const eraseOnlyGaps = oneSided.erase.filter((t) => !Object.hasOwn(KNOWN_GAP, t));
  console.log(
    `  One-sided debt — art. 14 (export) gap only: ${exportOnlyGaps.join(", ") || "none"}; art. 16 (erase) gap only: ${eraseOnlyGaps.join(", ") || "none"}.`,
  );
  console.log(dbLine);
}

// Guard: only run when invoked directly (not when imported by tests).
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-subject-rights-coverage.ts") ||
    process.argv[1].endsWith("check-subject-rights-coverage.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runCheck(process.argv.slice(2)).catch((err) => {
    console.error("✗ check-subject-rights-coverage: unexpected error:", err);
    process.exit(1);
  });
}
