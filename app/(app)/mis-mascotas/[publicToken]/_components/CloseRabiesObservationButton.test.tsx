// @vitest-environment jsdom
// RA-2 F3 — the rabies warning must reach the owner.
//
// ownerCloseRabiesObservationAction refuses the close when an escalating
// symptom was recorded during the observation window, and the refusal it
// returns is the one message that tells an owner their animal may be rabid
// ("Hubo síntomas compatibles con rabia … Contactá a tu vet.",
// owner-close-observation.ts). The banner used to `await` that action from an
// inline server action and discard the result: no useActionState, no error
// slot, nothing rendered. The button looked inert and the owner walked away
// believing the observation was closed.
//
// These tests pin the surface: every refusal is rendered, and only a genuine
// success navigates away.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  closeAction: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/src/modules/surveillance/actions", () => ({
  ownerCloseRabiesObservationAction: mocks.closeAction,
}));

vi.mock("@/lib/ui/full-page-action-nav", () => ({
  navigateAfterActionSuccess: mocks.navigate,
}));

import { CloseRabiesObservationButton } from "./CloseRabiesObservationButton";

const TOKEN = "DIM-DEMO-0002";

const RABIES_REFUSAL =
  "Hubo síntomas compatibles con rabia durante la observación. Este cierre requiere intervención profesional (veterinario o autoridad sanitaria). Contactá a tu vet.";

afterEach(() => {
  vi.clearAllMocks();
});

function clickClose() {
  render(<CloseRabiesObservationButton petPublicToken={TOKEN} />);
  fireEvent.click(screen.getByRole("button", { name: /Confirmar fin de observación/ }));
}

describe("CloseRabiesObservationButton", () => {
  it("SURFACES the rabies-symptom refusal instead of swallowing it", async () => {
    mocks.closeAction.mockResolvedValue({ error: RABIES_REFUSAL });
    clickClose();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(RABIES_REFUSAL);
    // The whole point: the owner is told to call a vet.
    expect(alert.textContent).toMatch(/Contactá a tu vet/);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("surfaces the premature-close refusal too", async () => {
    mocks.closeAction.mockResolvedValue({
      error: "Aún no se cumplieron los 10 días. Esperá hasta el 12/8/2026.",
    });
    clickClose();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Aún no se cumplieron los 10 días/);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("navigates away only on a genuine success, and shows no alert", async () => {
    mocks.closeAction.mockResolvedValue({ error: null });
    clickClose();

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/mis-mascotas/${TOKEN}`));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("calls the action with the pet's token", async () => {
    mocks.closeAction.mockResolvedValue({ error: null });
    clickClose();

    await waitFor(() => expect(mocks.closeAction).toHaveBeenCalledWith(TOKEN));
  });

  it("clears a previous refusal when the owner retries", async () => {
    mocks.closeAction.mockResolvedValueOnce({ error: RABIES_REFUSAL });
    clickClose();
    await screen.findByRole("alert");

    mocks.closeAction.mockResolvedValueOnce({ error: null });
    fireEvent.click(screen.getByRole("button", { name: /Confirmar fin de observación/ }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
