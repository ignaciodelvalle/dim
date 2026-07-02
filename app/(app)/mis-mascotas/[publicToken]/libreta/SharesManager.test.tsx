// @vitest-environment jsdom
//
// SharesManager — post-mutation staleness fix (QA finding 5a, engram #635).
// Revoke succeeded server-side but the in-sheet "Enlaces activos" list never
// updated (the revoked row + its "Revocar" button stayed live) because the
// list only ever came from the `shares` prop, snapshotted once by the parent
// (MergedShareSheet) on mount — revalidatePath() in the server action
// refreshes RSC trees, not this already-mounted client component's state.
//
// Fix: mirror `shares` into local state and trim the revoked row out of it
// using the server action's OWN return value (shareTokenRowId), not a
// reload/refetch.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibretaShareToken } from "@/db/schema";

const revokeLibretaShareAction = vi.fn();
const createLibretaShareAction = vi.fn();

vi.mock("@/app/actions/libreta-share", () => ({
  createLibretaShareAction: (...args: unknown[]) => createLibretaShareAction(...args),
  revokeLibretaShareAction: (...args: unknown[]) => revokeLibretaShareAction(...args),
}));

import { SharesManager } from "./SharesManager";

function makeShare(overrides: Partial<LibretaShareToken> = {}): LibretaShareToken {
  return {
    id: "share-1",
    shareToken: "tok-1",
    petId: "pet-1",
    createdByUserId: "user-1",
    label: "Vet de cabecera",
    expiresAt: null,
    revokedAt: null,
    revokedByUserId: null,
    viewCountCached: 0,
    lastViewedAtCached: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  revokeLibretaShareAction.mockReset();
  createLibretaShareAction.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("SharesManager — revoke updates the in-sheet list without reload", () => {
  it("removes the revoked row from the active-shares list on success", async () => {
    revokeLibretaShareAction.mockResolvedValue({ ok: true, shareTokenRowId: "share-1" });
    render(<SharesManager petPublicToken="TOKEN-1" shares={[makeShare()]} />);

    expect(screen.getByText("Vet de cabecera")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revocar" }));

    await waitFor(() => {
      expect(screen.queryByText("Vet de cabecera")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText("No hay enlaces activos. Crea uno para compartir la libreta."),
    ).toBeInTheDocument();
  });

  it("keeps other rows when only one share is revoked", async () => {
    revokeLibretaShareAction.mockResolvedValue({ ok: true, shareTokenRowId: "share-1" });
    render(
      <SharesManager
        petPublicToken="TOKEN-1"
        shares={[makeShare(), makeShare({ id: "share-2", label: "Guardería" })]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Revocar" })[0]);

    await waitFor(() => {
      expect(screen.queryByText("Vet de cabecera")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Guardería")).toBeInTheDocument();
  });

  it("leaves the list untouched when revoke fails", async () => {
    revokeLibretaShareAction.mockResolvedValue({
      error: "Sin permisos para revocar este compartido.",
    });
    render(<SharesManager petPublicToken="TOKEN-1" shares={[makeShare()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Revocar" }));

    await waitFor(() => {
      expect(screen.getByText("Sin permisos para revocar este compartido.")).toBeInTheDocument();
    });
    expect(screen.getByText("Vet de cabecera")).toBeInTheDocument();
  });
});
