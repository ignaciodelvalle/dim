// The vecino match page must not render on an unproven chip.
//
// /mis-mascotas/nueva/match/[matchedPetToken] shows the lost animal's owner
// first name and its last-seen location — the same PII the refugio twin gates
// behind an HMAC intake claim (review 24 HIGH #6/#7). Here the only requirement
// was a live session, for ANY lost pet's public token, and /perdidas publishes
// those tokens without a login. It also withholds the last-seen location when
// the owner opted out of disclosure; this page did not.
//
// The vecino equivalent of the org claim is knowing the code that produced the
// collision, arriving as ?chip=. These tests pin the gate itself: the page is
// an async function, so we call it and watch for notFound() — no DOM needed.

import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireUserOrRedirect: vi.fn().mockResolvedValue({ user: { id: "vecino-1" } }),
}));

const attemptedChipMatchesPetMock = vi.fn();
vi.mock("@/lib/infra/chip-lookup", () => ({
  attemptedChipMatchesPet: (petId: string, code: string) =>
    attemptedChipMatchesPetMock(petId, code),
}));

vi.mock("@/lib/infra/storage", () => ({ petPhotoUrl: () => null }));

// Drizzle chain stub: every builder method returns the chain, and awaiting it
// yields the next queued result. The page runs three queries in order —
// pet+photo, owner profile, latest lost event.
const queuedResults: unknown[][] = [];
vi.mock("@/db", async (importOriginal) => {
  // Partial mock: the real Drizzle schema objects stay (the page's transitive
  // imports build SQL fragments out of them at module load); only the client
  // is swapped, so nothing here opens a connection.
  const actual = await importOriginal<Record<string, unknown>>();
  const makeChain = () =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const rows = queuedResults.shift() ?? [];
            return (resolve: (v: unknown) => void) => resolve(rows);
          }
          return () => makeChain();
        },
      },
    );
  return { ...actual, db: { select: () => makeChain() } };
});

import VecinoMatchPage from "@/app/(app)/mis-mascotas/nueva/match/[matchedPetToken]/page";

const PET = { id: "pet-1", name: "Rocco", status: "lost", primaryPhotoId: null };

type Element = { type?: unknown; props: Record<string, unknown> };

/** Depth-first search of a returned server-component tree by component name. */
function findByTypeName(node: unknown, name: string): Element | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByTypeName(child, name);
      if (hit) return hit;
    }
    return undefined;
  }
  const el = node as Element;
  if (typeof el.type === "function" && (el.type as { name?: string }).name === name) return el;
  return el.props ? findByTypeName(el.props.children, name) : undefined;
}

function renderPage(chip?: string) {
  queuedResults.length = 0;
  queuedResults.push([{ pet: PET, photo: null }], [], []);
  return VecinoMatchPage({
    params: Promise.resolve({ matchedPetToken: "DIM-LOST-0001" }),
    searchParams: Promise.resolve(chip === undefined ? {} : { chip }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vecino match page — ?chip= gate", () => {
  it("404s when no chip is presented — a session and a public token are not enough", async () => {
    attemptedChipMatchesPetMock.mockResolvedValue(false);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(attemptedChipMatchesPetMock).toHaveBeenCalledWith("pet-1", "");
  });

  it("404s when the presented chip is not this animal's", async () => {
    attemptedChipMatchesPetMock.mockResolvedValue(false);
    await expect(renderPage("900000000000001")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders and hands the proven code to the card when the chip matches", async () => {
    attemptedChipMatchesPetMock.mockResolvedValue(true);
    const element = await renderPage("999000111222333");

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(attemptedChipMatchesPetMock).toHaveBeenCalledWith("pet-1", "999000111222333");

    // The card needs the code to authorize its own confirm call.
    const card = findByTypeName(element, "MatchConfirmationCardVecino");
    expect(card, "the page must render the confirmation card").toBeDefined();
    expect(card?.props.attemptedMicrochipId).toBe("999000111222333");
  });
});
