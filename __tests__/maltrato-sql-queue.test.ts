// Tests for the maltrato SQL-queue refactor (E4 followup).
//
// Three groups:
//   1. Unit tests for buildMaltratoListConditions — verifies the returned
//      Drizzle SQL object shape is deterministic and correct without a DB call.
//   2. Integration tests for queue predicates — inserts fixture welfare_reports
//      rows and asserts the right rows come back for urgent / mine / overdue.
//   3. Jurisdiction scope regression — mirrors gob-locality-scope.test.ts but
//      wires through buildMaltratoListConditions + an actual DB query to confirm
//      a govt user scoped to province A gets zero rows for province B.

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { db, welfareReports } from "@/db";
import {
  type MaltratoListFilters,
  type ModerationQueueFilters,
  buildMaltratoListConditions,
  buildModerationQueueConditions,
  fetchWelfareMetrics,
} from "@/lib/analytics/govt-dashboards";

// ============================================================================
// Unit tests — no DB required
// ============================================================================

/**
 * Drizzle SQL conditions contain circular references (PgTable → PgColumn →
 * PgTable) that break JSON.stringify. This extractor recursively collects all
 * primitive string/number values from the queryChunks tree so we can assert
 * that expected literals (field names, enum values) appear in the condition
 * without trying to serialize the whole object graph.
 */
function extractLiterals(node: unknown, seen = new WeakSet()): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  if (seen.has(node as object)) return "";
  seen.add(node as object);
  return Object.values(node as Record<string, unknown>)
    .map((v) => extractLiterals(v, seen))
    .join(" ");
}

describe("buildMaltratoListConditions — unit", () => {
  const BASE: MaltratoListFilters = {
    actor: { role: "govt" },
    filteredJurisdictions: [{ province: "Córdoba", locality: "Córdoba" }],
    queue: "all",
    currentUserId: "00000000-0000-0000-0000-000000000001",
  };

  it("returns sql`false` for govt with no assignments", () => {
    const result = buildMaltratoListConditions({
      ...BASE,
      filteredJurisdictions: [],
    });
    // The helper returns sql`false` — detect via the internal queryChunks literal.
    const chunks = (result as { queryChunks?: Array<{ value?: string[] }> }).queryChunks;
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks?.[0]?.value?.[0]).toBe("false");
  });

  it("returns a truthy condition for admin with no jurisdictions (unscoped)", () => {
    const result = buildMaltratoListConditions({
      ...BASE,
      actor: { role: "admin" },
      filteredJurisdictions: [],
      queue: "all",
    });
    // For admin the scope clause is null; the condition must still be defined.
    expect(result).toBeDefined();
  });

  it("includes severity + status predicates for urgent queue", () => {
    const result = buildMaltratoListConditions({ ...BASE, queue: "urgent" });
    const literals = extractLiterals(result);
    // urgent queue embeds the severity values and terminal statuses.
    expect(literals).toContain("critical");
    expect(literals).toContain("high");
    expect(literals).toContain("closed");
    expect(literals).toContain("invalid");
    expect(literals).toContain("duplicate");
  });

  it("includes assigned_to_user_id NULL check + terminal statuses for unassigned queue", () => {
    const result = buildMaltratoListConditions({ ...BASE, queue: "unassigned" });
    const literals = extractLiterals(result);
    // The unassigned queue mirrors the "Sin asignar" KPI predicate:
    // assigned_to_user_id IS NULL AND status NOT IN (terminal states).
    expect(literals).toContain("assigned_to_user_id");
    expect(literals).toContain("closed");
    expect(literals).toContain("invalid");
    expect(literals).toContain("duplicate");
  });

  it("includes assignedToUserId predicate for mine queue", () => {
    const userId = "00000000-0000-0000-0000-000000000099";
    const result = buildMaltratoListConditions({
      ...BASE,
      queue: "mine",
      currentUserId: userId,
    });
    expect(extractLiterals(result)).toContain(userId);
  });

  it("includes status=open and createdAt column reference for overdue queue", () => {
    const result = buildMaltratoListConditions({ ...BASE, queue: "overdue" });
    const literals = extractLiterals(result);
    expect(literals).toContain("open");
    // The created_at column name must appear in the condition tree.
    expect(literals).toContain("created_at");
  });

  it("includes kind value when kind filter is set", () => {
    const result = buildMaltratoListConditions({ ...BASE, kind: "neglect" });
    expect(extractLiterals(result)).toContain("neglect");
  });

  it("includes severity value when severity filter is set", () => {
    const result = buildMaltratoListConditions({ ...BASE, severity: "medium" });
    expect(extractLiterals(result)).toContain("medium");
  });
});

// ============================================================================
// Integration tests — DB required
// ============================================================================

const WR_PREFIX = "SQLQ-TEST-";
let seqN = 0;

// Resolved once per suite — must reference a real profile for the
// assignedToUserId FK. We use admin@dim.test (seeded by db:bootstrap).
let adminUserId: string;

async function resolveAdminUserId(): Promise<string> {
  const rows = (await db.execute(
    sql`SELECT p.id::text AS id FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE u.email = 'admin@dim.test' LIMIT 1`,
  )) as Array<{ id: string }>;
  const first = rows[0];
  if (!first?.id)
    throw new Error("admin@dim.test profile not found. Run `pnpm db:bootstrap` first.");
  return first.id;
}

async function insertReport(input: {
  province?: string;
  locality?: string;
  status?: "open" | "triaged" | "in_progress" | "closed" | "invalid" | "duplicate";
  severity?: "low" | "medium" | "high" | "critical";
  kind?: "neglect" | "physical_abuse" | "abandonment" | "hoarding" | "other";
  assignedToUserId?: string | null;
  closedAt?: Date | null;
  createdAt?: Date;
  flaggedAt?: Date | null;
  flagReasons?: string[] | null;
  moderationResolvedAt?: Date | null;
  moderationEscalatedAt?: Date | null;
}): Promise<string> {
  seqN += 1;
  const [row] = await db
    .insert(welfareReports)
    .values({
      referenceCode: `${WR_PREFIX}${Date.now()}-${seqN}`,
      kind: input.kind ?? "neglect",
      severity: input.severity ?? "medium",
      description: "SQL queue test fixture.",
      subjectKind: "unowned_animal",
      jurisdictionProvince: input.province ?? "Buenos Aires",
      jurisdictionLocality: input.locality ?? "La Plata",
      status: input.status ?? "open",
      assignedToUserId: input.assignedToUserId ?? null,
      closedAt: input.closedAt ?? null,
      // Only set moderation columns when provided — flag_reasons is NOT NULL
      // with a DB default, so omitting lets the default apply.
      ...(input.flaggedAt !== undefined ? { flaggedAt: input.flaggedAt } : {}),
      ...(input.flagReasons !== undefined ? { flagReasons: input.flagReasons } : {}),
      ...(input.moderationResolvedAt !== undefined
        ? { moderationResolvedAt: input.moderationResolvedAt }
        : {}),
      ...(input.moderationEscalatedAt !== undefined
        ? { moderationEscalatedAt: input.moderationEscalatedAt }
        : {}),
    })
    .returning({ id: welfareReports.id });

  // Override createdAt if requested (for overdue testing).
  if (input.createdAt) {
    await db
      .update(welfareReports)
      .set({ createdAt: input.createdAt })
      .where(eq(welfareReports.id, row.id));
  }

  return row.id;
}

async function cleanup() {
  await db
    .delete(welfareReports)
    .where(sql`${welfareReports.referenceCode} LIKE ${`${WR_PREFIX}%`}`);
}

beforeAll(async () => {
  adminUserId = await resolveAdminUserId();
  await cleanup();
});
afterEach(cleanup);

// Helper: detect whether a Drizzle SQL condition is the `sql`false`` sentinel.
// We check the first queryChunk literal — sql`false` produces [{value:["false"]}].
// Using this avoids JSON.stringify which throws on circular Drizzle table refs.
function isSqlFalseSentinel(cond: ReturnType<typeof buildMaltratoListConditions>): boolean {
  if (!cond) return false;
  const chunks = (cond as { queryChunks?: Array<{ value?: string[] }> }).queryChunks;
  return Array.isArray(chunks) && chunks.length === 1 && chunks[0]?.value?.[0] === "false";
}

// Helper: run a scoped query using buildMaltratoListConditions and return IDs.
async function queryIds(filters: MaltratoListFilters): Promise<string[]> {
  const cond = buildMaltratoListConditions(filters);
  // Short-circuit when the helper returns sql`false` (govt with no assignments).
  if (isSqlFalseSentinel(cond)) return [];
  const rows = await db
    .select({ id: welfareReports.id })
    .from(welfareReports)
    .where(cond)
    .orderBy(welfareReports.createdAt);
  return rows.map((r) => r.id);
}

const GOVT_CORDOBA: MaltratoListFilters = {
  actor: { role: "govt" },
  filteredJurisdictions: [{ province: "Córdoba", locality: "Villa María" }],
  queue: "all",
  currentUserId: "00000000-0000-0000-0000-000000000001",
};

// ============================================================================
// Queue predicates
// ============================================================================

describe("buildMaltratoListConditions — queue: urgent (integration)", () => {
  it("returns critical/high severity reports that are not terminal", async () => {
    const urgentId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      severity: "critical",
      status: "open",
    });
    const lowId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      severity: "low",
      status: "open",
    });
    const closedUrgentId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      severity: "high",
      status: "closed",
      closedAt: new Date(),
    });

    const ids = await queryIds({ ...GOVT_CORDOBA, queue: "urgent" });

    expect(ids).toContain(urgentId);
    expect(ids).not.toContain(lowId);
    expect(ids).not.toContain(closedUrgentId);
  });

  it("also includes high severity not-terminal", async () => {
    const highId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      severity: "high",
      status: "triaged",
    });
    const ids = await queryIds({ ...GOVT_CORDOBA, queue: "urgent" });
    expect(ids).toContain(highId);
  });
});

describe("buildMaltratoListConditions — queue: mine (integration)", () => {
  it("returns only reports assigned to currentUserId", async () => {
    // assignedToUserId must reference a real profile — use the seeded admin.
    const mineId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      assignedToUserId: adminUserId,
    });
    const notMineId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      assignedToUserId: null,
    });

    const ids = await queryIds({ ...GOVT_CORDOBA, queue: "mine", currentUserId: adminUserId });
    expect(ids).toContain(mineId);
    expect(ids).not.toContain(notMineId);
  });
});

describe("buildMaltratoListConditions — queue: unassigned (integration)", () => {
  it("returns only unassigned, non-terminal reports (matches the Sin asignar KPI)", async () => {
    // Isolated jurisdiction so the metric count reflects only these fixtures.
    const prov = "Chaco";
    const loc = `unassigned-test-${Date.now()}`;

    const unassignedOpenId = await insertReport({
      province: prov,
      locality: loc,
      status: "open",
      assignedToUserId: null,
    });
    const unassignedTriagedId = await insertReport({
      province: prov,
      locality: loc,
      status: "triaged",
      assignedToUserId: null,
    });
    const assignedOpenId = await insertReport({
      province: prov,
      locality: loc,
      status: "open",
      assignedToUserId: adminUserId,
    });
    const unassignedClosedId = await insertReport({
      province: prov,
      locality: loc,
      status: "closed",
      closedAt: new Date(),
      assignedToUserId: null,
    });

    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: prov, locality: loc }],
      queue: "unassigned",
      currentUserId: adminUserId,
    });

    // Matches: unassigned + non-terminal.
    expect(ids).toContain(unassignedOpenId);
    expect(ids).toContain(unassignedTriagedId);
    // Excludes: assigned rows and terminal (closed) rows.
    expect(ids).not.toContain(assignedOpenId);
    expect(ids).not.toContain(unassignedClosedId);
  });

  it("the unassigned queue count equals the Sin asignar KPI metric for the same scope", async () => {
    // The KPI tile links to ?queue=unassigned; this asserts the destination
    // list and the counted metric are the SAME set — the wayfinding contract.
    const prov = "Chaco";
    const loc = `unassigned-kpi-${Date.now()}`;

    await insertReport({ province: prov, locality: loc, status: "open", assignedToUserId: null });
    await insertReport({
      province: prov,
      locality: loc,
      status: "triaged",
      assignedToUserId: null,
    });
    await insertReport({
      province: prov,
      locality: loc,
      status: "open",
      assignedToUserId: adminUserId,
    });
    await insertReport({
      province: prov,
      locality: loc,
      status: "closed",
      closedAt: new Date(),
      assignedToUserId: null,
    });

    const scope = [{ province: prov, locality: loc }];
    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: scope,
      queue: "unassigned",
      currentUserId: adminUserId,
    });
    const metrics = await fetchWelfareMetrics({ role: "govt" }, scope, adminUserId);

    // Two unassigned non-terminal rows; the KPI and its drill-down agree.
    expect(ids).toHaveLength(2);
    expect(metrics.unassignedCount).toBe(ids.length);
  });
});

describe("buildMaltratoListConditions — queue: overdue (integration)", () => {
  it("returns open reports older than 7 days", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const overdueId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      status: "open",
      createdAt: eightDaysAgo,
    });
    const recentId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      status: "open",
      // Default createdAt = now (not overdue).
    });
    const oldButTriagedId = await insertReport({
      province: "Córdoba",
      locality: "Villa María",
      status: "triaged",
      createdAt: eightDaysAgo,
    });

    const ids = await queryIds({ ...GOVT_CORDOBA, queue: "overdue" });
    expect(ids).toContain(overdueId);
    expect(ids).not.toContain(recentId);
    // Overdue only applies to status=open; triaged should be excluded.
    expect(ids).not.toContain(oldButTriagedId);
  });
});

// ============================================================================
// Jurisdiction scope regression (mirrors gob-locality-scope.test.ts)
// ============================================================================

describe("buildMaltratoListConditions — jurisdiction scope (integration)", () => {
  it("govt assigned to province A sees ZERO rows when selecting province B", async () => {
    // Insert a report in Santa Fe (province B).
    await insertReport({ province: "Santa Fe", locality: "Rosario" });

    // Govt scoped only to Córdoba / Villa María (province A).
    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: "Córdoba", locality: "Villa María" }],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    // Must not include any Santa Fe row.
    const allReports = await db
      .select({ id: welfareReports.id, prov: welfareReports.jurisdictionProvince })
      .from(welfareReports)
      .where(sql`${welfareReports.referenceCode} LIKE ${`${WR_PREFIX}%`}`);

    const santaFeIds = allReports.filter((r) => r.prov === "Santa Fe").map((r) => r.id);
    for (const id of santaFeIds) {
      expect(ids).not.toContain(id);
    }
  });

  it("govt with empty filteredJurisdictions sees zero rows", async () => {
    await insertReport({ province: "Córdoba", locality: "Villa María" });
    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    expect(ids).toHaveLength(0);
  });

  it("admin (unscoped) sees reports from any province", async () => {
    const idA = await insertReport({ province: "Córdoba", locality: "Villa María" });
    const idB = await insertReport({ province: "Santa Fe", locality: "Rosario" });

    const ids = await queryIds({
      actor: { role: "admin" },
      filteredJurisdictions: [],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
  });

  it("govt assigned province A + locality X gets zero rows when URL selects province A + locality Y (out-of-assignment)", async () => {
    // Assignment: Córdoba / Villa María
    // URL selects: Córdoba / Río Cuarto (not in assignments)
    // filteredJurisdictions after intersection = [] → zero rows
    await insertReport({ province: "Córdoba", locality: "Río Cuarto" });

    const ids = await queryIds({
      actor: { role: "govt" },
      // This is what the page computes after intersection: empty because Río Cuarto
      // is not in the govt's assignment list.
      filteredJurisdictions: [],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    expect(ids).toHaveLength(0);
  });
});

// ============================================================================
// Pagination / limit sanity
// ============================================================================

describe("pagination sanity (integration)", () => {
  it("offset + limit correctly pages through results", async () => {
    // Insert 3 reports in a unique isolated jurisdiction. The locality is
    // synthetic (a real one like Resistencia is populated by the national demo
    // seed, whose welfare reports would inflate the page counts below).
    const prov = "Chaco";
    const loc = `pagination-test-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      await insertReport({ province: prov, locality: loc });
    }

    const cond = buildMaltratoListConditions({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: prov, locality: loc }],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    // Page 1: 2 rows.
    const page1 = await db
      .select({ id: welfareReports.id })
      .from(welfareReports)
      .where(cond)
      .orderBy(welfareReports.createdAt)
      .limit(2)
      .offset(0);

    // Page 2: 1 row.
    const page2 = await db
      .select({ id: welfareReports.id })
      .from(welfareReports)
      .where(cond)
      .orderBy(welfareReports.createdAt)
      .limit(2)
      .offset(2);

    // Total via count.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(welfareReports)
      .where(cond);

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    expect(n).toBe(3);
    // No overlap between pages.
    const ids1 = new Set(page1.map((r) => r.id));
    for (const r of page2) expect(ids1.has(r.id)).toBe(false);
  });
});

// ============================================================================
// parsePage cap — unit tests
// ============================================================================

// Inline copy of parsePage from the page module (private fn — tested here inline).
function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10_000) : 1;
}

describe("parsePage — unit", () => {
  it("returns 1 for undefined", () => expect(parsePage(undefined)).toBe(1));
  it("returns 1 for empty string", () => expect(parsePage("")).toBe(1));
  it("returns 1 for 0", () => expect(parsePage("0")).toBe(1));
  it("returns 1 for negative", () => expect(parsePage("-5")).toBe(1));
  it("returns 1 for NaN string", () => expect(parsePage("abc")).toBe(1));
  it("returns the page for a normal value", () => expect(parsePage("3")).toBe(3));
  it("floors decimal pages", () => expect(parsePage("2.9")).toBe(2));
  it("caps at 10_000", () => expect(parsePage("99999")).toBe(10_000));
  it("caps Infinity", () => expect(parsePage("Infinity")).toBe(1)); // Infinity is not finite
  it("returns exactly 10_000 for '10000'", () => expect(parsePage("10000")).toBe(10_000));
});

// ============================================================================
// CABA two-tier locality scope (jurisdiction-scoping class bug — 2026-07-07)
//
// INDEC models CABA as ONE locality ("Ciudad Autónoma de Buenos Aires"); the 48
// barrios (Palermo, Almagro, …) are a finer overlay. A govt operator assigned
// the whole-city locality governs ALL of CABA and MUST see barrio-tagged
// denuncias — an anonymous denuncia whose address geocoded to a barrio was
// invisible before the isWholeProvinceLocality subsumption fix.
// ============================================================================

const CABA_WHOLE = "Ciudad Autónoma de Buenos Aires";

describe("buildMaltratoListConditions — CABA whole-province subsumption (integration)", () => {
  it("whole-CABA operator sees barrio-tagged reports (Almagro, Palermo) but not other provinces", async () => {
    const almagroId = await insertReport({ province: "CABA", locality: "Almagro" });
    const palermoId = await insertReport({ province: "CABA", locality: "Palermo" });
    const wholeCityId = await insertReport({ province: "CABA", locality: CABA_WHOLE });
    const saltaId = await insertReport({ province: "Salta", locality: "Salta" });

    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: "CABA", locality: CABA_WHOLE }],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    // Barrio-tagged + whole-city CABA rows are all visible to the whole-CABA operator.
    expect(ids).toContain(almagroId);
    expect(ids).toContain(palermoId);
    expect(ids).toContain(wholeCityId);
    // Other provinces stay invisible (the fix must NOT widen security).
    expect(ids).not.toContain(saltaId);
  });

  it("a Salta operator does NOT see a CABA barrio report (cross-province isolation preserved)", async () => {
    const almagroId = await insertReport({ province: "CABA", locality: "Almagro" });

    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: "Salta", locality: "Salta" }],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    expect(ids).not.toContain(almagroId);
  });

  it("a barrio-scoped operator (CABA / Palermo) stays narrow — sees Palermo, not Almagro", async () => {
    const almagroId = await insertReport({ province: "CABA", locality: "Almagro" });
    const palermoId = await insertReport({ province: "CABA", locality: "Palermo" });

    const ids = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: "CABA", locality: "Palermo" }],
      queue: "all",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    expect(ids).toContain(palermoId);
    // Barrio-specific assignment is exact-match only — no subsumption.
    expect(ids).not.toContain(almagroId);
  });
});

// ============================================================================
// Flagged-vs-unflagged routing: moderation queue vs triage queue
//
// Anonymous denuncias are auto-flagged by heuristics ONLY when a reason fires.
// Unflagged reports go straight to the /gob/maltrato triage queue; flagged
// (unresolved) reports are held in the admin /admin/moderacion queue and are
// EXCLUDED from triage until moderation resolves them. DEN-6WQX-CCUC was never
// flagged, so its absence from /admin/moderacion is correct.
// ============================================================================

function isModSqlFalse(cond: ReturnType<typeof buildModerationQueueConditions>): boolean {
  if (!cond) return false;
  const chunks = (cond as { queryChunks?: Array<{ value?: string[] }> }).queryChunks;
  return Array.isArray(chunks) && chunks.length === 1 && chunks[0]?.value?.[0] === "false";
}

async function queryModerationIds(filters: ModerationQueueFilters): Promise<string[]> {
  const cond = buildModerationQueueConditions(filters);
  if (isModSqlFalse(cond)) return [];
  const rows = await db.select({ id: welfareReports.id }).from(welfareReports).where(cond);
  return rows.map((r) => r.id);
}

describe("flagged-vs-unflagged routing (integration)", () => {
  const ADMIN_TRIAGE: MaltratoListFilters = {
    actor: { role: "admin" },
    filteredJurisdictions: [],
    queue: "all",
    currentUserId: "00000000-0000-0000-0000-000000000001",
  };
  const ADMIN_MOD: ModerationQueueFilters = {
    actor: { role: "admin" },
    jurisdictions: [],
    status: "pending",
  };

  it("an unflagged report is in the triage queue but NOT the moderation queue", async () => {
    const unflaggedId = await insertReport({ province: "Salta", locality: "Salta" });

    const triageIds = await queryIds({
      ...ADMIN_TRIAGE,
      selectedProvince: "Salta",
    });
    const modIds = await queryModerationIds(ADMIN_MOD);

    expect(triageIds).toContain(unflaggedId);
    expect(modIds).not.toContain(unflaggedId);
  });

  it("a flagged, unresolved report is in the moderation queue but EXCLUDED from triage", async () => {
    const flaggedId = await insertReport({
      province: "Salta",
      locality: "Salta",
      flaggedAt: new Date(),
      flagReasons: ["short_description"],
    });

    const triageIds = await queryIds({
      ...ADMIN_TRIAGE,
      selectedProvince: "Salta",
    });
    const modIds = await queryModerationIds(ADMIN_MOD);

    expect(modIds).toContain(flaggedId);
    expect(triageIds).not.toContain(flaggedId);
  });

  it("a flagged report that was moderation-resolved re-enters the triage queue", async () => {
    const resolvedId = await insertReport({
      province: "Salta",
      locality: "Salta",
      flaggedAt: new Date(),
      flagReasons: ["short_description"],
      moderationResolvedAt: new Date(),
    });

    const triageIds = await queryIds({
      ...ADMIN_TRIAGE,
      selectedProvince: "Salta",
    });
    expect(triageIds).toContain(resolvedId);
  });
});

// ============================================================================
// includeEscalated — govt vs admin "pending" parity (PO decision 2026-07-19:
// unify /admin/moderacion's hand-rolled predicate into buildModerationQueueConditions)
// ============================================================================

describe("buildModerationQueueConditions — includeEscalated (integration)", () => {
  it("default (includeEscalated omitted) EXCLUDES an escalated-but-unresolved report — govt queue", async () => {
    const escalatedId = await insertReport({
      province: "Salta",
      locality: "Salta",
      flaggedAt: new Date(),
      flagReasons: ["short_description"],
      moderationEscalatedAt: new Date(),
    });

    const govtIds = await queryModerationIds({
      actor: { role: "govt" },
      jurisdictions: [{ province: "Salta", locality: "Salta" }],
      status: "pending",
      // includeEscalated omitted — govt actionable-queue semantics.
    });

    expect(govtIds).not.toContain(escalatedId);
  });

  it("includeEscalated: true INCLUDES an escalated-but-unresolved report — admin inbox", async () => {
    const escalatedId = await insertReport({
      province: "Salta",
      locality: "Salta",
      flaggedAt: new Date(),
      flagReasons: ["short_description"],
      moderationEscalatedAt: new Date(),
    });

    const adminIds = await queryModerationIds({
      actor: { role: "admin" },
      jurisdictions: [],
      status: "pending",
      includeEscalated: true,
    });

    expect(adminIds).toContain(escalatedId);
  });

  it("includeEscalated: true still excludes a moderation-resolved report from pending", async () => {
    const resolvedId = await insertReport({
      province: "Salta",
      locality: "Salta",
      flaggedAt: new Date(),
      flagReasons: ["short_description"],
      moderationEscalatedAt: new Date(),
      moderationResolvedAt: new Date(),
    });

    const adminIds = await queryModerationIds({
      actor: { role: "admin" },
      jurisdictions: [],
      status: "pending",
      includeEscalated: true,
    });

    expect(adminIds).not.toContain(resolvedId);
  });
});

// ============================================================================
// Status filter — unit + integration
// ============================================================================

describe("buildMaltratoListConditions — status filter (unit)", () => {
  const BASE: MaltratoListFilters = {
    actor: { role: "govt" },
    filteredJurisdictions: [{ province: "Córdoba", locality: "Córdoba" }],
    queue: "all",
    currentUserId: "00000000-0000-0000-0000-000000000001",
  };

  it("includes status value when status filter is set", () => {
    const result = buildMaltratoListConditions({ ...BASE, status: "closed" });
    expect(extractLiterals(result)).toContain("closed");
  });

  it("condition with status=null is shorter than with status='closed' (no extra eq)", () => {
    const withStatus = buildMaltratoListConditions({ ...BASE, status: "closed" });
    const withoutStatus = buildMaltratoListConditions({ ...BASE, status: null });
    // When status is null, no extra status condition is added — the SQL literal
    // string should be strictly shorter.
    expect(extractLiterals(withStatus).length).toBeGreaterThan(
      extractLiterals(withoutStatus).length,
    );
  });
});

describe("buildMaltratoListConditions — status filter (integration)", () => {
  it("returns only reports with the specified status", async () => {
    const openId = await insertReport({
      province: "Formosa",
      locality: "Formosa",
      status: "open",
    });
    const closedId = await insertReport({
      province: "Formosa",
      locality: "Formosa",
      status: "closed",
      closedAt: new Date(),
    });

    const openIds = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: "Formosa", locality: "Formosa" }],
      queue: "all",
      status: "open",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    expect(openIds).toContain(openId);
    expect(openIds).not.toContain(closedId);

    const closedIds = await queryIds({
      actor: { role: "govt" },
      filteredJurisdictions: [{ province: "Formosa", locality: "Formosa" }],
      queue: "all",
      status: "closed",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    expect(closedIds).toContain(closedId);
    expect(closedIds).not.toContain(openId);
  });
});

// ============================================================================
// Admin province/locality filter (C-1)
// ============================================================================

describe("buildMaltratoListConditions — admin province/locality filter (integration)", () => {
  it("admin selecting province X returns only reports from province X", async () => {
    const cordobaId = await insertReport({ province: "Córdoba", locality: "Córdoba" });
    const santaFeId = await insertReport({ province: "Santa Fe", locality: "Santa Fe" });

    const ids = await queryIds({
      actor: { role: "admin" },
      filteredJurisdictions: [],
      queue: "all",
      selectedProvince: "Córdoba",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    expect(ids).toContain(cordobaId);
    expect(ids).not.toContain(santaFeId);
  });

  it("admin selecting province + locality returns only matching rows", async () => {
    const cordobaCityId = await insertReport({ province: "Córdoba", locality: "Córdoba" });
    const villaMaria = await insertReport({ province: "Córdoba", locality: "Villa María" });

    const ids = await queryIds({
      actor: { role: "admin" },
      filteredJurisdictions: [],
      queue: "all",
      selectedProvince: "Córdoba",
      selectedLocality: "Córdoba",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    expect(ids).toContain(cordobaCityId);
    expect(ids).not.toContain(villaMaria);
  });

  it("govt user (province A) selecting province B still returns ZERO rows (bypass-proof)", async () => {
    // This is the key safety test: govt assigned to Córdoba cannot see Santa Fe
    // reports by passing selectedProvince — we do NOT pass selectedProvince for
    // govt; the page uses filteredJurisdictions intersection instead.
    await insertReport({ province: "Santa Fe", locality: "Rosario" });

    const ids = await queryIds({
      actor: { role: "govt" },
      // filteredJurisdictions after intersection with assignments scoped to Córdoba = []
      // because Santa Fe is not in the assignments list.
      filteredJurisdictions: [],
      queue: "all",
      // Even if selectedProvince were passed for govt (which the page never does),
      // the short-circuit at the top of buildMaltratoListConditions returns sql`false`
      // before any selectedProvince check runs.
      selectedProvince: "Santa Fe",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });
    expect(ids).toHaveLength(0);
  });

  it("COUNT uses the same WHERE as the list query (same condition object reuse)", async () => {
    const id = await insertReport({ province: "La Pampa", locality: "Santa Rosa" });

    const cond = buildMaltratoListConditions({
      actor: { role: "admin" },
      filteredJurisdictions: [],
      queue: "all",
      selectedProvince: "La Pampa",
      currentUserId: "00000000-0000-0000-0000-000000000001",
    });

    const listRows = await db.select({ id: welfareReports.id }).from(welfareReports).where(cond);

    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(welfareReports)
      .where(cond);

    // COUNT and list must agree.
    expect(n).toBe(listRows.length);
    expect(listRows.map((r) => r.id)).toContain(id);
  });
});
