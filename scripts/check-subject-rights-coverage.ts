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
// table in the public schema must be classified into exactly one of four lists,
// and the two covered lists are verified BOTH WAYS against the live function
// bodies.
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
// reach eighteen. Deriving from the baseline would declare twelve covered
// tables out of scope and call the result coverage.
//
// THE FOUR LISTS, AND WHY THERE ARE FOUR RATHER THAN THREE
// ---------------------------------------------------------------------------
//   IN_EXPORT / IN_ERASE — the table is named in that function's live body. A
//     table may be in both. Verified in both directions.
//   EXEMPT — the table holds no personal data of a natural person beyond an
//     opaque actor FK recording who performed an official act. One written
//     reason per entry.
//   KNOWN_GAP — the table DOES hold subject data and neither RPC reaches it.
//
// The fourth list is the point. A three-list design forces every uncovered
// table into EXEMPT, and there are seventeen tables here that hold real
// subject data the RPCs do not touch. Writing "exempt" next to each of them
// would be seventeen false statements in the one file whose whole job is to
// stop a false statement about coverage. KNOWN_GAP names the debt, prints it on
// every run, and still fails on a table that is in no list at all — so the NEXT
// pet_caretaker_grants cannot arrive unnoticed, and the existing ones cannot be
// laundered into "reviewed and fine".
//
// The count is prose and drifts: it read "twenty-one" while the list held 20
// (0207 closed libreta_share_tokens and only the test ceiling was lowered).
// 0208 closed operator_feed_watermarks, physical_tag_interest and
// organization_invitations, so it is seventeen. The number the CI line prints
// is computed from the list; this sentence is the one a human has to maintain.
//
// Moving a table OUT of KNOWN_GAP is done by adding it to a function, not by
// editing this file: check 4 fails a KNOWN_GAP entry that the live body
// mentions, and check 3 fails an IN_* entry that it does not.
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
  "  NOT RUN: subject-rights table classification, and the two-way check of\n" +
  "  export_subject_data / erase_subject_data against their declared tables.";

/** Tables `export_subject_data` returns a section for, or reads to scope one. */
export const IN_EXPORT: readonly string[] = [
  "audit_log",
  "custody_dispute_parties",
  "custody_disputes",
  "foster_volunteers",
  "notifications",
  "operator_feed_watermarks",
  "org_contact_messages",
  "organization_invitations",
  "organization_memberships",
  "ownerships",
  "pet_caretaker_grants",
  "pet_events",
  "pet_identifications",
  "pet_tags",
  "pet_transfers",
  "pets",
  "physical_tag_interest",
  "profiles",
  "push_subscriptions",
  "welfare_reports",
];

/** Tables `erase_subject_data` writes to, or reads to scope a write. */
export const IN_ERASE: readonly string[] = [
  "audit_log",
  "case_events",
  "custody_dispute_parties",
  "foster_volunteers",
  // 0207: the erasure revokes the subject's outstanding libreta shares (their
  // own grants of access die with the account). The art. 14 side is still a
  // gap — export_subject_data does not return the `label` the user typed —
  // but the table can no longer sit in KNOWN_GAP: erase reaches it.
  "libreta_share_tokens",
  "notifications",
  // 0208: the watermark row is DELETED (user_id is its PK — it cannot exist
  // without naming the subject), and the export returns it first so art. 14
  // shows what art. 16 is about to destroy.
  "operator_feed_watermarks",
  "org_contact_messages",
  // 0208: REDACTED, not deleted. The invitee email is sentinelled and
  // outstanding invitations are revoked on both sides, while the actor FKs and
  // the accepted rows stay — an accepted invitation is the provenance of an
  // organization membership, and that trail is not the subject's alone.
  "organization_invitations",
  "ownerships",
  "pet_caretaker_grants",
  "pet_events",
  "pet_tags",
  "pet_transfers",
  "pets",
  // 0208: DELETED. `user_id` is NOT NULL, so the row cannot be anonymised in
  // place — a demand signal is not a lawful basis for keeping a named row.
  "physical_tag_interest",
  "profiles",
  "push_subscriptions",
  "welfare_reports",
];

/**
 * No personal data of a natural person, beyond an opaque actor FK recording who
 * performed an official act. Those FKs are deliberately out of scope: the
 * accountability trail they form is the thing art. 16 may NOT erase, and
 * `audit_log` — which both RPCs already reach — is its canonical instrument.
 */
export const EXEMPT: Record<string, string> = {
  _dim_migrations: "Migration ledger: filename, checksum, applied_at. No person.",
  ar_localities: "INDEC locality catalogue. Public reference data.",
  ar_localities_import_runs: "Telemetry for the locality catalogue import job.",
  attachments:
    "Reached from TypeScript rather than SQL: erase-subject-data.ts::purgeOwnedPetAttachments deletes the storage object AND the row for every pet the subject owns. It cannot move into the RPC — SQL has no object-store access, so deleting the row here would orphan the file. RESIDUAL, stated rather than hidden: an attachment the subject uploaded onto SOMEBODY ELSE'S pet is not reached by either path.",
  cron_runs: "Cron telemetry. Drained on a 90-day TTL by runDataLifecyclePurge.",
  eno_processing_queue: "Work queue keyed on pet_event_id — status, retries, last error.",
  jurisdictions_census: "Published census figures per jurisdiction.",
  organization_coverage: "An organization's declared coverage zones.",
  panorama_cube: "k-anonymised aggregate (k=5, AGENTS.md §6). No row is a person.",
  panorama_cube_meta: "Build metadata for panorama_cube — timestamps and row counts.",
  panorama_kpi_cube: "k-anonymised KPI aggregate (k=5). No row is a person.",
  panorama_kpi_cube_meta: "Build metadata for panorama_kpi_cube.",
  rate_limit_buckets:
    "Abuse-prevention counters on a short-lived cohort key, drained every run by runDataLifecyclePurge. A security control's live window is not what art. 16 reaches, and the row expires on its own.",
  service_schedule_rules: "Opening hours of a service offering. No person.",
  time_slots: "Capacity counters on a service offering. No person.",
};

/**
 * Tables that DO hold subject data and that neither RPC reaches. This is a debt
 * register, not an exemption list — see the header. Every entry names what is
 * actually in there, so the size of the remaining art. 14 / art. 16 gap is a
 * number somebody can read rather than a thing somebody has to rediscover.
 */
export const KNOWN_GAP: Record<string, string> = {
  alert_firings: "Free-text `notes` written by a govt operator while working an alert.",
  alert_subscriptions: "The subject's own alert `label` and thresholds (actor_user_id).",
  appointments: "owner_user_id plus `notes_from_owner`, `notes_from_org`, `cancellation_reason`.",
  approval_requests:
    "applicant_user_id / target_user_id, a free-form `payload` jsonb and `decision_notes`.",
  cases: "applicant_user_id and the free-text `opened_reason`; the shell around case_events.",
  event_notification_outbox: "`payload_snapshot` carries a copy of the source event's payload.",
  foster_proposals:
    "volunteer_user_id plus `proposed_notes`, `response_notes`, `cancellation_reason` — free text about the volunteer.",
  govt_assignments: "The subject's official assignment, `revocation_reason` and `notes`.",
  govt_business_rules: "Operator `notes` and the created_by / updated_by actor pair.",
  notification_dead_letter: "The undelivered notification's `payload` — its title and body.",
  organization_capability_grants: "`requested_reason` and `decision_reason` free text.",
  organizations:
    "A legal entity, but `email` / `phone` may be a natural person's for a one-person org, and created_by / verified_by are actor FKs.",
  pet_achievement_views: "One row per (user, pet, achievement) — a per-user reading record.",
  pet_service_dog: "Credential fields and `notes`, plus verified_by / revoked_by actor FKs.",
  reminders: "user_id plus the reminder's `title` and `description`.",
  service_offerings: "provider_user_id — a natural person can be the provider — and `description`.",
  welfare_report_attachments: "uploaded_by_user_id and `original_filename`.",
};

type Violation = { kind: string; message: string };

type FunctionDefRow = { proname: string; def: string };
type TableRow = { tablename: string };

/**
 * Does the function body name this table? Matched as `public.<name>` with a
 * word boundary, never as a bare substring: `pets` would otherwise match
 * nothing useful and a future `pet_event_notes` would match `pet_events`. Both
 * RPCs schema-qualify every table reference, which is what makes this exact.
 */
export function bodyMentions(def: string, table: string): boolean {
  return new RegExp(`\\bpublic\\.${table}\\b`).test(def);
}

/** Which of the four lists name this table. */
function declaredIn(t: string): string[] {
  const where: string[] = [];
  if (IN_EXPORT.includes(t)) where.push("IN_EXPORT");
  if (IN_ERASE.includes(t)) where.push("IN_ERASE");
  if (Object.hasOwn(EXEMPT, t)) where.push("EXEMPT");
  if (Object.hasOwn(KNOWN_GAP, t)) where.push("KNOWN_GAP");
  return where;
}

/**
 * Check 1 — every live table is classified, and EXEMPT / KNOWN_GAP are
 * exclusive of everything else. IN_EXPORT + IN_ERASE is the only legal pairing.
 */
function checkClassification(tables: readonly string[]): Violation[] {
  const violations: Violation[] = [];
  for (const t of tables) {
    const where = declaredIn(t);
    if (where.length === 0) {
      violations.push({
        kind: "unclassified",
        message: `✗ ${t} — in NO list. A new public table must be declared in scripts/check-subject-rights-coverage.ts: add it to a subject-rights RPC and list it in IN_EXPORT / IN_ERASE, or classify it as EXEMPT (no personal data of a natural person) or KNOWN_GAP (holds subject data neither RPC reaches) with a written reason. This is the check that pet_caretaker_grants needed and did not have.`,
      });
      continue;
    }
    const covered = where.filter((w) => w.startsWith("IN_"));
    const uncovered = where.filter((w) => !w.startsWith("IN_"));
    if (covered.length > 0 && uncovered.length > 0) {
      violations.push({
        kind: "double_classified",
        message: `✗ ${t} — declared both as covered (${covered.join(" + ")}) and as ${uncovered.join(" + ")}. Pick one.`,
      });
    }
    if (uncovered.length > 1) {
      violations.push({
        kind: "double_classified",
        message: `✗ ${t} — declared as both EXEMPT and KNOWN_GAP. Pick one.`,
      });
    }
  }
  return violations;
}

/** Check 2 — no stale entry: a declared table that no longer exists. */
function checkStaleEntries(live: ReadonlySet<string>): Violation[] {
  const violations: Violation[] = [];
  const allLists = [
    ["IN_EXPORT", IN_EXPORT],
    ["IN_ERASE", IN_ERASE],
    ["EXEMPT", Object.keys(EXEMPT)],
    ["KNOWN_GAP", Object.keys(KNOWN_GAP)],
  ] as const;
  for (const [list, names] of allLists) {
    for (const t of names) {
      if (!live.has(t)) {
        violations.push({
          kind: "stale",
          message: `✗ ${t} — listed in ${list} but no such table exists in the public schema. Remove the entry.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Check 3 — forward direction: a declared table must actually be in the live
 * body. Catches a future CREATE OR REPLACE that drops a section, and catches a
 * hand-patched environment whose function does not match the migrations.
 */
function checkForwardDirection(
  live: ReadonlySet<string>,
  exportDef: string,
  eraseDef: string,
): Violation[] {
  const violations: Violation[] = [];
  const pairs = [
    ["IN_EXPORT", "export_subject_data", IN_EXPORT, exportDef],
    ["IN_ERASE", "erase_subject_data", IN_ERASE, eraseDef],
  ] as const;
  for (const [list, fn, names, def] of pairs) {
    for (const t of names) {
      if (live.has(t) && !bodyMentions(def, t)) {
        violations.push({
          kind: "missing_from_function",
          message: `✗ ${t} — declared ${list} but the LIVE ${fn} body never names public.${t}. Either a replace dropped the section, or this database was not migrated.`,
        });
      }
    }
  }
  return violations;
}

/**
 * Check 4 — reverse direction: an EXEMPT or KNOWN_GAP table must NOT be in
 * either body. This is what makes closing a gap a one-way door — you cannot add
 * a table to a function and leave it sitting in the debt register.
 */
function checkReverseDirection(
  live: ReadonlySet<string>,
  exportDef: string,
  eraseDef: string,
): Violation[] {
  const violations: Violation[] = [];
  for (const t of [...Object.keys(EXEMPT), ...Object.keys(KNOWN_GAP)]) {
    if (!live.has(t)) continue;
    const inExport = bodyMentions(exportDef, t);
    const inErase = bodyMentions(eraseDef, t);
    if (!inExport && !inErase) continue;
    const listName = Object.hasOwn(EXEMPT, t) ? "EXEMPT" : "KNOWN_GAP";
    const where = [inExport && "export_subject_data", inErase && "erase_subject_data"]
      .filter(Boolean)
      .join(" and ");
    violations.push({
      kind: "covered_but_listed_uncovered",
      message: `✗ ${t} — listed as ${listName} but ${where} names public.${t}. Move it to IN_EXPORT / IN_ERASE.`,
    });
  }
  return violations;
}

export function evaluate(
  tables: readonly string[],
  exportDef: string,
  eraseDef: string,
): { violations: Violation[]; gapCount: number } {
  const live = new Set(tables);
  return {
    violations: [
      ...checkClassification(tables),
      ...checkStaleEntries(live),
      ...checkForwardDirection(live, exportDef, eraseDef),
      ...checkReverseDirection(live, exportDef, eraseDef),
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
