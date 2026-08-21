// Source pin: the accept transaction locks the titular's live `owner` row.
// Layer: Unit (reads source, no DB). WU3 review, L-1.
//
// WHY A SOURCE PIN AND NOT A LOCK HARNESS
// ---------------------------------------------------------------------------
// ADR-1 step 2 asserts the consenting titular still holds a live `owner` row,
// under the CASE lock only. A person-to-person transfer committing between that
// read and the step-5 insert would grant an org custody on the consent of an
// ex-owner. `SELECT ... FOR UPDATE` on the owner row closes that window: the
// transfer's own close of the row then blocks behind this transaction, and the
// transaction after it re-reads a closed row and refuses.
//
// The repo has no concurrent-transaction harness precedent (no pg_locks /
// NOWAIT assertions anywhere under __tests__ or src), so this pins the SOURCE:
// the read the use-case makes inside the transaction is the locking one, and
// the locking one really says `.for("update")`. The unlocked read still exists
// for the request path, which runs outside any transaction.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MODULE_ROOT = join(__dirname, "..");
const repositorySrc = readFileSync(
  join(MODULE_ROOT, "infrastructure", "rehome-repository.ts"),
  "utf8",
);
const respondSrc = readFileSync(
  join(MODULE_ROOT, "application", "respond-to-rehome-request.ts"),
  "utf8",
);

/** The body of one `async name(` method of the repository object literal. */
function methodBody(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  expect(start, `${name} is not a method of RehomeRepository`).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("\n  async ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("respond-to-rehome-request — the titular's owner row is locked under the accept transaction", () => {
  it("RehomeRepository.lockLiveOwnerRow reads the live owner row FOR UPDATE", () => {
    const body = methodBody(repositorySrc, "lockLiveOwnerRow");
    expect(body).toContain('eq(ownerships.role, "owner")');
    expect(body).toContain("isNull(ownerships.endedAt)");
    expect(body).toContain('.for("update")');
  });

  it("the unlocked read stays unlocked — the request path runs outside a transaction", () => {
    const body = methodBody(repositorySrc, "findLiveOwnerRow");
    expect(body).not.toContain('.for("update")');
  });

  it("the accept transaction calls the locking read, never the unlocked one", () => {
    expect(respondSrc).toContain("repo.lockLiveOwnerRow(");
    expect(respondSrc).not.toContain("repo.findLiveOwnerRow(");
  });
});
