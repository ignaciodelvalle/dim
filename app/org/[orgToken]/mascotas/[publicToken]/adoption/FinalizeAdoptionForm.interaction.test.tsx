// @vitest-environment jsdom
//
// Interaction test for the finalize-adoption router-drop cure (QA ALTO,
// 2026-07-16). Exercises the REAL useActionState + useActionRedirect chain via
// RTL + jsdom: submit the form, let the mocked server action resolve, and
// assert the resulting state (a) drives a FULL document navigation via
// lib/ui/full-page-action-nav.ts's navigateAfterActionSuccess (immune to the
// Next 15.5.x router-drop), and (b) lands on the org custody LIST, never the
// transferred pet's now-404 ficha.
//
// Pattern mirrors NumericWindowRuleForm.interaction.test.tsx.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actionMock = vi.fn();
vi.mock("@/src/modules/adoption/actions", () => ({
  finalizeAdoptionAction: Object.assign((...args: unknown[]) => actionMock(...args), {
    bind:
      (_thisArg: unknown, orgToken: string, publicToken: string) =>
      (...args: unknown[]) =>
        actionMock(orgToken, publicToken, ...args),
  }),
}));

const navigateMock = vi.fn();
vi.mock("@/lib/ui/full-page-action-nav", () => ({
  navigateAfterActionSuccess: (url: string) => navigateMock(url),
}));

import { FinalizeAdoptionForm } from "./FinalizeAdoptionForm";

const BASE_PROPS = {
  orgToken: "org-tok",
  publicToken: "DIM-1234-5678",
  fosterShortcut: null,
  // One approved application → the form defaults to the application path (no
  // required DNI field), so a bare programmatic submit reaches the action.
  approvedApplications: [{ applicationEventId: "app-1", applicantName: "Juana" }],
};

beforeEach(() => {
  actionMock.mockReset();
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("<FinalizeAdoptionForm> — post-success navigation (QA ALTO 2026-07-16)", () => {
  it("navigates to the org custody LIST (not the transferred pet's ficha) on success", async () => {
    actionMock.mockResolvedValue({
      error: null,
      redirectTo: "/org/org-tok/mascotas?adopcion=DIM-1234-5678",
    });

    render(<FinalizeAdoptionForm {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "Finalizar adopción" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/org/org-tok/mascotas?adopcion=DIM-1234-5678");
    });
    expect(navigateMock).toHaveBeenCalledTimes(1);
    // Destination is the LIST, never the pet's ficha (which now 404s).
    expect(navigateMock.mock.calls[0][0]).not.toContain("/mascotas/DIM-1234-5678");
  });

  it("resolves the pending state and does NOT navigate when the action errors", async () => {
    actionMock.mockResolvedValue({ error: "No se pudo finalizar la adopción." });

    render(<FinalizeAdoptionForm {...BASE_PROPS} />);

    const button = screen.getByRole("button", { name: "Finalizar adopción" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("No se pudo finalizar la adopción.")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
    // The button left the "Finalizando adopción…" pending label — it is no
    // longer stuck disabled forever (the QA symptom).
    expect(screen.getByRole("button", { name: "Finalizar adopción" })).toBeEnabled();
  });
});
