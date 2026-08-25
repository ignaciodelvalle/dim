// Sponsored-custody hand-off fence — CI guardrail (rehome-by-titular, REQ-15).
//
// THE QUESTION THIS ASKS
// ---------------------------------------------------------------------------
// "This writer is moving a pet's custody from one ORGANIZATION to another. Did
// anything on the way there ask whether that custody row was opened by a
// titular's consent?"
//
// WHY IT EXISTS — two doors, one guard
// ---------------------------------------------------------------------------
// REQ-15 says a `shelter_custody` row that a titular's consent opened is not
// the org's to hand off: the animal lives with its family, and only the
// titular's withdraw, a decline before acceptance, or a completed adoption end
// that arrangement. The guard for it, `validateSourceNotSponsored`, was
// written onto `proposeCrossOrgTransfer` — the path the author had in mind.
//
// There were TWO org-to-org hand-off paths. `transferCustody` had its own
// front door (findPetUnderOrg instead of findActiveShelterCustody, no
// free-text reason, destination role chosen by the sender) and ZERO references
// to sponsorship, rehome, or the guard. It is the one that ran: on staging, pet
// DIM-JRSF-9775 carried a live sponsorship whose spine `payload.ownership_id`
// was exactly the id of its single live `shelter_custody` row, and that path
// still opened case CAS-NBGE-CS3C. Both doors are guarded as of 2026-08-25.
//
// So this fence's whole reason for existing is the THIRD door — the one that
// does not exist yet, in a module nobody has written. A list of "these two
// call sites are guarded" proves nothing about a default-ALLOW rule; the next
// instance is precisely the one that is not on the list. This repo has the
// lesson written down already: ban the SUBJECT, not the forms.
//
// WHAT THE SUBJECT IS, AND WHY IT IS THE SPINE EVENT
// ---------------------------------------------------------------------------
// The candidates were: (a) every writer that opens a
// `custody_transfer_handshake` case; (b) every writer that ends or reassigns a
// `shelter_custody` row; (c) every caller of the custody-transfer repository
// methods. None of the three is the subject.
//
//   (a) is a FORM. It is how today's two doors happen to seek the receiver's
//       consent. `transferCustody` itself did not always work that way — until
//       the 2026-07-05 trust-model fix it was a unilateral flip that opened no
//       case at all. A fence keyed on the case kind would have been blind to
//       the very shape this codebase already shipped once.
//   (b) is too broad to mean anything. A decomiso, an intake, the titular's
//       own withdraw and a completed adoption all end custody rows, and most
//       of them SHOULD. Keyed there, the fence would need an allowlist longer
//       than its finding list, and an allowlist that big is the fence lying.
//   (c) is a naming convention wearing a security boundary's clothes — the
//       same thing check-authz-guards.ts discovered about its own globs. A
//       third door with its own repository is not covered by it.
//
// The subject is the FACT, and in this codebase facts live in the append-only
// event spine (invariant 3). An org-to-org hand-off of custody IS a
// `custody_transfer_proposed` / `custody_transferred` event whose payload names
// a `from_organization_id` AND a `to_organization_id`. That is not a form: a
// hand-off that writes no such event has not happened as far as this system is
// concerned, and a writer that moves custody without one is already illegal
// under invariant 2 and is lint:spine's subject, not this one.
//
// So: every spine write of a custody-transfer event that moves custody from an
// organization to an organization must ASK the sponsorship question. Two
// answers satisfy it — refuse (`validateSourceNotSponsored`) or deliberately
// end it (`endAllLiveOwnerships`, whose required `sponsorshipOutcome` argument
// makes the answer unskippable) — and the full argument for why both count is
// on SPONSORSHIP_DISCHARGES below. Silence is the violation.
//
// BOTH ENDS, not just the destination. The first draft asked only "does this
// hand custody to an org?", and that over-collected: `ownerProposeReturnToOrg`
// and `orgAcceptOwnerReturn` write `to_organization_id` with
// `from_organization_id: null` and `from_role: "owner"`. Their source is a
// PERSON's owner row — there is no source custody row for a guard keyed on
// `ownership_id` to compare against, and the person initiating is the titular
// REQ-15 exists to protect, not the party it restrains. Narrowing to both ends
// is not a convenience: it is the guard's own applicability condition, read off
// the record instead of asserted about a file.
//
// WHY IT PROPAGATES THROUGH CALLS
// ---------------------------------------------------------------------------
// The guard is not always in the function that writes the event.
// `acceptCrossOrgTransfer` writes `custody_transferred` and satisfies REQ-15
// through `refuseIfSponsoredCustody`, a module-local helper — not exported, so
// the sibling fences' exported-function extractors do not see it. A fence that
// looked only at the writing function would report that file as an offender
// and teach the next author to inline the guard to appease it. So the check
// runs over a transitive, name-based call closure seeded from every function
// that names the guard, the way check-titular-gate.ts propagates effects. That
// closure is exercised for real by accept-cross-org-transfer.ts today; it is
// not a synthetic capability.
//
// WHAT THIS DELIBERATELY DOES NOT COVER — stated, not glossed
// ---------------------------------------------------------------------------
//   - Every move with a PERSON at either end — eight writers today: the two
//     return-to-owner proposers, the owner↔org returns, the decomiso return to
//     owner, the foster→owner conversion, and acceptPetTransfer (owner→owner,
//     which has its OWN sponsorship guard, shape-keyed rather than id-keyed).
//     The org→titular direction is NOT endorsed by this omission: a refugio
//     holding a sponsorship on a pet reported lost can propose returning it to
//     the very titular whose consent opened that sponsorship, and the right
//     answer there is plausibly to END the sponsorship rather than refuse —
//     the opposite of what this guard does. Refusing with this sentence ("no se
//     puede transferir a otra organización") would be wrong, and guessing which
//     answer is right is not a fence's job. Open question, deliberately left
//     open, and named here so it is a decision and not an oversight.
//   - A custody move that writes NO spine event. Already illegal (invariant 2);
//     lint:spine is the instrument for it.
//   - Whether the discharge, once reached, is CORRECT — that the query is the
//     right query, that the refusal fires, that the `sponsorshipOutcome` chosen
//     is the right one. That is the unit tests' subject
//     (transfers/application/__tests__/use-cases.test.ts). This fence proves
//     the question is asked, never that the answer is right.
//   - The two decomiso sites in CUSTODY_HANDOFF_ALLOWLIST, whose safety rests
//     on a guarantee established one function upstream and across a case
//     boundary. Read the reasons there; they are arguments, not exemptions.
//   - SQL-level custody moves in migrations or scripts. Out of the scan set on
//     purpose: a migration is reviewed as a migration.
//
// THE FENCE DOES NOT GUESS. A custody-transfer event write whose payload leaves
// either end of the move undeclared is reported as a violation, not waved
// through. "It is probably fine" is exactly the reasoning that let the second
// door ship.
//
// Run:  pnpm tsx scripts/check-custody-handoff-sponsorship.ts
//       (or: pnpm lint:custody-sponsorship)
// Exits 0 when every org-to-org custody hand-off reaches the guard.
// Exits 1 naming each offending write with file:line, its event type and the
//   enclosing function, or when the corpus it examined is implausibly small.

import { globSync, readFileSync } from "node:fs";

import { stripComments } from "./lib/strip-comments.mjs";

// ---------------------------------------------------------------------------
// The subject
// ---------------------------------------------------------------------------

/**
 * The spine's record of a custody hand-off. `custody_transfer_proposed` is the
 * offer, `custody_transferred` is the completed move; both must ask, because
 * the proposal is what puts a case in a receiver's inbox and the completion is
 * what actually moves the row.
 */
export const CUSTODY_HANDOFF_EVENT_TYPES = [
  "custody_transfer_proposed",
  "custody_transferred",
] as const;

/** The refusal. The answer a peer-to-peer hand-off must give. */
export const SPONSORSHIP_GUARD = "validateSourceNotSponsored";

/**
 * TWO ANSWERS SATISFY THIS FENCE, NOT ONE — and getting that wrong would have
 * made the fence a liar about four real sites.
 *
 * REQ-15's rule is not "never move a sponsored custody row". It is "never move
 * one SILENTLY". A peer org handing custody to another peer must REFUSE
 * (`validateSourceNotSponsored`), because neither party outranks the titular.
 * An AUTHORITY — a decomiso seizure, a govt/admin resolving a custody dispute
 * — may instead END the sponsorship, and does: `endAllLiveOwnerships` requires
 * a `sponsorshipOutcome` in its argument type, so the type checker will not let
 * a caller through without answering, and the answer both authority paths give
 * is `withdrawn_by_platform` ("decided by the authority over both parties:
 * neither the titular withdrew nor the org resigned, and nobody adopted"). That
 * writes `rehome_sponsorship_ended` into the spine, so the titular's withdraw
 * has nothing left to fail to find — the exact harm the refusal prevents.
 *
 * What this fence forbids is a hand-off that does NEITHER. That is precisely
 * what `transferCustody` did, and it is the only shape with no defensible
 * reading.
 */
export const SPONSORSHIP_DISCHARGES = [SPONSORSHIP_GUARD, "endAllLiveOwnerships"] as const;

/**
 * Documented exceptions: `"<relPath>#<fn>"` → reason. EMPTY IS THE GOAL, and
 * `__tests__/check-custody-handoff-sponsorship.test.ts` asserts the real tree
 * produces no offender outside it, and that every reason here is long enough to
 * be an argument rather than a shrug.
 *
 * Both entries are the SAME cross-function guarantee, and it is one this fence
 * genuinely cannot see: a decomiso's `shelter_custody` row for the government
 * org is created by `executeDecomiso` (execute-decomiso.ts:452) in the same
 * transaction that already discharged any sponsorship on the pet
 * (`endAllLiveOwnerships`, execute-decomiso.ts:428). A sponsorship's
 * `ownership_id` can therefore never name the govt's transitional row: it can
 * only name the row that existed BEFORE the seizure, which is closed and its
 * event written by the time either of these functions runs. Verified 2026-08-25
 * by reading both call chains, not assumed.
 */
export const CUSTODY_HANDOFF_ALLOWLIST: Record<string, string> = {
  "src/modules/decomiso/application/accept-decomiso-handoff.ts#acceptDecomisoHandoffInTx":
    "Closes the GOVERNMENT org's transitional shelter_custody row, which executeDecomiso opened after it had already ended any sponsorship on the pet in the same transaction (execute-decomiso.ts:428 endAllLiveOwnerships, sponsorshipOutcome withdrawn_by_platform). A sponsorship's ownership_id cannot name a row created after the sponsorship was closed, so there is nothing here for the guard to find. The guarantee lives one function upstream and across a case boundary — outside what a call-closure fence can read.",
  "src/modules/decomiso/application/reassign-decomiso.ts#reassignDecomisoInTx":
    "Touches no ownership row at all: it re-points a still-open govt-held proposal at a different receiver org and updates cases.receiver_organization_id. The file does not import ownerships. The custody being proposed is the same government transitional row covered by the accept-decomiso-handoff entry above, and no row transition happens here for a sponsorship to be silently carried through.",
};

const SOURCE_GLOBS = ["src/**/*.ts", "app/**/*.ts", "app/**/*.tsx"];

// ---------------------------------------------------------------------------
// Anti-vacuity floors — in the script, not only in the tests
// ---------------------------------------------------------------------------
//
// `pnpm verify` runs this in a lane with no test runner, so a scanner that
// quietly stopped matching would report a clean tree there and nowhere else.
// Three floors, because there are three distinct ways to judge nothing while
// looking healthy.

/**
 * Files opened and comment-stripped. A glob that stops resolving dies here.
 * Measured 2026-08-25: 1424.
 */
export const MIN_SCANNED_FILES = 1000;
/**
 * Custody-transfer event WRITES found, either direction. Separate from the
 * files floor: the globs can keep resolving while the write detector stops
 * recognising the shape it is looking for. Measured: 15.
 */
export const MIN_HANDOFF_SITES = 12;
/**
 * Of those, the ones this fence actually judges — an org's custody going to an
 * org. Separate again, because a direction classifier that started reading
 * every payload as person-bound would keep both totals healthy and judge
 * nothing. Measured: 7 (3 transfers + 3 decomiso + 1 dispute resolution).
 */
export const MIN_ORG_TO_ORG_SITES = 6;

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------

export type ScanSource = { relPath: string; src: string };

function isScannable(relPath: string): boolean {
  return (
    !relPath.includes("__tests__/") &&
    !/\.test\.[cm]?tsx?$/.test(relPath) &&
    !relPath.endsWith(".d.ts")
  );
}

export function listScanSources(): ScanSource[] {
  const seen = new Set<string>();
  for (const pattern of SOURCE_GLOBS) {
    for (const file of globSync(pattern)) {
      const rel = file.split("\\").join("/");
      if (isScannable(rel)) seen.add(rel);
    }
  }
  return [...seen]
    .sort()
    .map((relPath) => ({ relPath, src: stripComments(readFileSync(relPath, "utf8")) }));
}

// ---------------------------------------------------------------------------
// Brace walking
// ---------------------------------------------------------------------------

/**
 * Blanks the CONTENTS of string and template literals, 1:1, preserving length
 * so offsets computed on the comment-stripped source still line up.
 *
 * stripComments deliberately KEEPS string contents (a token inside a string can
 * be a real violation), which is right for finding the event-type literal — and
 * wrong for brace walking, where a `}` inside a notification body's template
 * would be counted as structure. Both views of the same bytes, used for the two
 * different questions.
 */
export function blankStringContents(src: string): string {
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < src.length) {
        const c = src[i];
        if (c === "\\") {
          out[i] = " ";
          if (i + 1 < src.length && src[i + 1] !== "\n") out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (c === quote) break;
        if (c !== "\n") out[i] = " ";
        i += 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

/**
 * The object literal that encloses `idx`: walks backward to the `{` that opens
 * it, then forward to its match. Returns null when the offset is not inside a
 * brace pair at all — a bare comparison against the event-type literal, which
 * is not a write.
 */
export function enclosingBraceBlock(
  blanked: string,
  idx: number,
): { start: number; end: number } | null {
  let depth = 0;
  let start = -1;
  for (let i = idx; i >= 0; i -= 1) {
    const c = blanked[i];
    if (c === "}") depth += 1;
    else if (c === "{") {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < blanked.length; i += 1) {
    const c = blanked[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

/**
 * Control-flow keywords look exactly like a call at the start of a line
 * (`  if (`, `  for (`). Without this, every write inside an `if` was reported
 * as living in a function named "if".
 */
const FUNCTION_PATTERNS = [
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]*)?=\s*(?:async\s*)?\(/g,
  /^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/gm,
];

const NOT_A_FUNCTION_NAME = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "await",
  "typeof",
  "do",
  "with",
  "yield",
  "throw",
  "new",
  "delete",
  "void",
  "in",
  "of",
]);

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

// ---------------------------------------------------------------------------
// Site detection
// ---------------------------------------------------------------------------

/**
 * What the record says about the two ends of the move.
 *
 *   org_to_org      — an organization's custody row going to an organization.
 *                     THE SUBJECT. `validateSourceNotSponsored` keys on the
 *                     source custody row's id, so this is exactly the class in
 *                     which the guard has something to key on, and exactly the
 *                     class REQ-15 protects.
 *   not_org_to_org  — one end is a person. The return-to-owner proposers and
 *                     the owner→org returns are here (`from_organization_id:
 *                     null`, `from_role: "owner"`): the source is a person's
 *                     `owner` row, there is no source custody row, and the
 *                     titular is the party REQ-15 exists to protect rather than
 *                     the one it restrains.
 *   undeclared      — the record does not say. A violation, never a pass.
 */
export type Direction = "org_to_org" | "not_org_to_org" | "undeclared";

export type HandoffSite = {
  relPath: string;
  eventType: string;
  direction: Direction;
  line: number;
  /** Enclosing function name, or "<module>" when the write is at top level. */
  fn: string;
};

/** Reads `key: <value>` out of an object-literal slice, value up to `,` or EOL. */
function readKey(block: string, key: string): string | null {
  const m = new RegExp(`\\b${key}\\s*:\\s*([^,\\n}]*)`).exec(block);
  return m ? m[1].trim() : null;
}

/**
 * The enclosing function's name: the nearest declaration textually before the
 * write. Name-based like every sibling fence — good enough to report a location
 * and to key the call closure, and stated as such rather than implied.
 */
function enclosingFunctionName(blanked: string, idx: number): string {
  let name = "<module>";
  for (const d of declarationSites(blanked)) {
    if (d.at > idx) break;
    name = d.name;
  }
  return name;
}

/**
 * Every custody-transfer event WRITE in one file, with the destination its
 * payload declares.
 *
 * A WRITE, not a read. The same literal appears in query predicates all over
 * the repo (`eq(petEvents.eventType, "custody_transfer_proposed")`, a dozen
 * return-to-owner and page-level reads), and a fence that counted those would
 * demand the guard from every page that merely LOOKS at a hand-off. The
 * separator is the literal's position: a write puts it in the record being
 * constructed, either as the `eventType:` key of the row or as the first
 * argument of `validateEventPayload`. A read passes it as a comparison operand
 * — `petEvents.eventType,` with a comma, never `eventType:` with a colon.
 *
 * Both construction forms are covered because both are live here: the transfers
 * module builds the row inline, decomiso validates the payload first and
 * references it by variable at the insert. Keyed on the RECORD, not on the name
 * of the helper that inserts it, so a third insert helper is covered for free.
 */
export function findHandoffSites(source: ScanSource): HandoffSite[] {
  const { relPath, src } = source;
  if (!CUSTODY_HANDOFF_EVENT_TYPES.some((t) => src.includes(t))) return [];
  const blanked = blankStringContents(src);
  const sites: HandoffSite[] = [];

  for (const eventType of CUSTODY_HANDOFF_EVENT_TYPES) {
    const re = new RegExp(
      `(?:\\beventType\\s*:\\s*|\\bevent_type\\s*:\\s*|\\bvalidateEventPayload\\s*\\(\\s*)["'\`]${eventType}["'\`]`,
      "g",
    );
    let m = re.exec(src);
    while (m) {
      const at = m.index + m[0].length - 1;
      const block = enclosingBraceBlock(blanked, at);
      // The `validateEventPayload("X", { … })` form carries its payload as the
      // SECOND argument, outside the row literal — read forward from the call.
      const text = block
        ? src.slice(block.start, block.end + 1)
        : src.slice(m.index, m.index + 1200);
      const forward = src.slice(m.index, m.index + 1200);
      // An `eventType:` key with NO payload beside it is not a write — it is
      // declarative configuration. The case lifecycles name the event that
      // OPENS each kind exactly that way (`opensEvents: [{ eventType: … }]`),
      // and a fence that read those as writes would demand a runtime guard
      // from a static table. The `validateEventPayload(…)` form needs no such
      // evidence: constructing the payload is what it is for.
      const isPayloadCall = /validateEventPayload/.test(m[0]);
      if (!isPayloadCall && !/\bpayload\b\s*[,:}]/.test(text)) {
        m = re.exec(src);
        continue;
      }
      const read = (key: string) => readKey(text, key) ?? readKey(forward, key);
      const toOrg = read("to_organization_id");
      const fromOrg = read("from_organization_id");
      const declared =
        (read("to_user_id") ?? toOrg) !== null && (read("from_user_id") ?? fromOrg) !== null;
      let direction: Direction = "undeclared";
      if (toOrg !== null && toOrg !== "null" && fromOrg !== null && fromOrg !== "null") {
        direction = "org_to_org";
      } else if (declared) {
        direction = "not_org_to_org";
      }
      sites.push({
        relPath,
        eventType,
        direction,
        line: lineOf(src, m.index),
        fn: enclosingFunctionName(blanked, m.index),
      });
      m = re.exec(src);
    }
  }
  return dedupeConstructions(sites);
}

/**
 * One event, two literals. decomiso validates the payload
 * (`validateEventPayload("custody_transferred", {…to_organization_id…})`) and
 * then inserts the row referencing it by variable (`payload: transferPayload`),
 * so the insert's own literal reads as an undeclared destination. They are the
 * same construction, and folding them by (file, function, event type) keeps the
 * fence from inventing a violation out of a factoring style.
 *
 * The fold takes the MOST RESTRICTIVE destination present, so a function that
 * genuinely built two events of one type would be judged on the org-bound one.
 */
function dedupeConstructions(sites: HandoffSite[]): HandoffSite[] {
  const byKey = new Map<string, HandoffSite>();
  const rank: Record<Direction, number> = { org_to_org: 3, not_org_to_org: 2, undeclared: 1 };
  for (const site of sites) {
    const key = `${site.relPath}#${site.fn}#${site.eventType}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, site);
      continue;
    }
    if (rank[site.direction] > rank[prev.direction]) {
      byKey.set(key, { ...prev, direction: site.direction });
    }
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Guard reachability — transitive, name-based
// ---------------------------------------------------------------------------

type FnUnit = { relPath: string; name: string; body: string };

/**
 * Declaration positions in one file, sorted. Shared by the unit extractor and
 * by the "which function is this write in?" lookup, so the two can never
 * disagree about where a function begins.
 */
function declarationSites(blanked: string): { at: number; name: string }[] {
  const found: { at: number; name: string }[] = [];
  for (const re of FUNCTION_PATTERNS) {
    re.lastIndex = 0;
    let m = re.exec(blanked);
    while (m) {
      if (!NOT_A_FUNCTION_NAME.has(m[1])) found.push({ at: m.index, name: m[1] });
      m = re.exec(blanked);
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

/**
 * Function-ish declarations, each with the TEXT REGION that runs to the next
 * declaration.
 *
 * NOT brace-matched bodies, and the reason is worth stating: the first `{`
 * after `transferCustody(` belongs to `Promise<UseCaseResult<{ … }>>`, its
 * RETURN TYPE. A body finder that takes the first brace captures the type and
 * reports the repo's own guarded use-cases as unguarded — which is exactly what
 * the first draft of this fence did. Regions cost precision at nested closures
 * and buy immunity from every TypeScript brace that is not a block; the
 * name-based call closure re-links anything a region split apart.
 */
export function extractFunctions(source: ScanSource): FnUnit[] {
  const { relPath, src } = source;
  const decls = declarationSites(blankStringContents(src));
  return decls.map((d, i) => ({
    relPath,
    name: d.name,
    body: src.slice(d.at, i + 1 < decls.length ? decls[i + 1].at : src.length),
  }));
}

function callsIdentifier(body: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*\\(`).test(body);
}

/**
 * Every function name that reaches ONE OF the discharges: directly, or by
 * calling something that does. Bounded fixpoint — a cycle cannot grow the set
 * forever, and 20 passes is far past the deepest real chain (today's is 2).
 */
export function indexGuardedFunctions(sources: ScanSource[]): Set<string> {
  const units = sources.flatMap(extractFunctions);
  const guarded = new Set<string>(SPONSORSHIP_DISCHARGES);
  for (let pass = 0; pass < 20; pass += 1) {
    let grew = false;
    for (const unit of units) {
      if (guarded.has(unit.name)) continue;
      for (const name of guarded) {
        if (callsIdentifier(unit.body, name)) {
          guarded.add(unit.name);
          grew = true;
          break;
        }
      }
    }
    if (!grew) break;
  }
  return guarded;
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export type Offender = { site: HandoffSite; problem: string };

export function findUnguardedHandoffs(sources: ScanSource[]): Offender[] {
  const guarded = indexGuardedFunctions(sources);
  const offenders: Offender[] = [];
  for (const source of sources) {
    for (const site of findHandoffSites(source)) {
      if (site.direction === "not_org_to_org") continue;
      if (CUSTODY_HANDOFF_ALLOWLIST[`${site.relPath}#${site.fn}`]) continue;
      if (site.direction === "undeclared") {
        offenders.push({
          site,
          problem:
            "its payload does not declare both ends of the move (from_user_id / from_organization_id and to_user_id / to_organization_id), so whether this is an org-to-org hand-off cannot be read. This fence does not guess",
        });
        continue;
      }
      if (!guarded.has(site.fn)) {
        offenders.push({
          site,
          problem: `it hands an organization's custody to another organization, but neither ${site.fn} nor anything it calls reaches ${SPONSORSHIP_DISCHARGES.join(" or ")} — the sponsorship question is never asked`,
        });
      }
    }
  }
  return offenders;
}

export function allSites(sources: ScanSource[]): HandoffSite[] {
  return sources.flatMap(findHandoffSites);
}

function runCheck(): void {
  const sources = listScanSources();
  const sites = allSites(sources);
  const orgSites = sites.filter((s) => s.direction === "org_to_org");

  // Anti-vacuity BEFORE the verdict: a fence that judged nothing must never
  // reach one.
  const floors: string[] = [];
  const floor = (label: string, n: number, min: number, hint: string) => {
    if (n < min) floors.push(`✗ ${label}: ${n}, expected at least ${min}. ${hint}`);
  };
  floor(
    "scan set — source file(s)",
    sources.length,
    MIN_SCANNED_FILES,
    "SOURCE_GLOBS stopped resolving.",
  );
  floor(
    "detector — custody-transfer event write(s)",
    sites.length,
    MIN_HANDOFF_SITES,
    "The files were opened but the write detector stopped recognising the shape — the same silent pass, one level down.",
  );
  floor(
    "classifier — org-to-org write(s)",
    orgSites.length,
    MIN_ORG_TO_ORG_SITES,
    "Org-to-org writes are the only ones this fence judges; a classifier reading them all as person-bound keeps both totals healthy and judges nothing.",
  );
  if (floors.length > 0) {
    for (const f of floors) console.error(f);
    console.error(
      "\n✗ check-custody-handoff-sponsorship judged an implausibly small corpus. This check cannot pass having examined almost nothing.",
    );
    process.exit(1);
  }

  const offenders = findUnguardedHandoffs(sources);
  if (offenders.length > 0) {
    for (const { site, problem } of offenders) {
      console.error(
        `✗ ${site.relPath}:${site.line} writes ${site.eventType} from ${site.fn} — ${problem}.`,
      );
    }
    const lines = [
      `\n${offenders.length} org-to-org custody hand-off(s) that never ask the sponsorship question.`,
      "A shelter_custody row a titular's consent opened is not the org's to hand off (REQ-15): the",
      "animal lives with its family, and only the titular ends that arrangement. Answer it one of",
      "two ways, whichever this hand-off actually is:",
      `  - a PEER hand-off refuses — call ${SPONSORSHIP_GUARD}`,
      "    (src/modules/transfers/domain/cross-org-rules.ts) with the SOURCE custody row's id,",
      "    before a receiver is bothered;",
      "  - an AUTHORITY move ends it — call endAllLiveOwnerships (lib/infra/end-pet-ownerships.ts)",
      "    with an explicit sponsorshipOutcome, so rehome_sponsorship_ended reaches the spine and",
      "    the titular's withdraw has nothing left to fail to find.",
      "Silence is the only answer with no defensible reading. If this really is neither, document",
      "the exception in CUSTODY_HANDOFF_ALLOWLIST with the reason.",
    ];
    console.error(lines.join("\n"));
    process.exit(1);
  }

  console.log(
    `✓ check-custody-handoff-sponsorship: ${orgSites.length} org-to-org custody hand-off(s) across ${sites.length} custody-transfer event write(s) in ${sources.length} file(s) — every one asks the sponsorship question (${Object.keys(CUSTODY_HANDOFF_ALLOWLIST).length} documented exception(s)).`,
  );
}

const invokedPath = process.argv[1]?.split("\\").join("/") ?? "";
const isMain =
  invokedPath.endsWith("scripts/check-custody-handoff-sponsorship.ts") ||
  invokedPath.endsWith("scripts/check-custody-handoff-sponsorship.js");
if (isMain) runCheck();
