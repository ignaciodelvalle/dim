// @vitest-environment jsdom
//
// MicrochipRequiredForm — E5 (2026-07-21 facades harvest). The
// microchip_required rule type had a validator/default/RULE_TYPE_REGISTRY
// entry and a live migration (0150) but no write-side form, so no
// jurisdiction could ever override the hardcoded "required: true" default.
// This pins that the form renders, submits the right FormData shape (ruleType
// + required boolean via the checkbox), and navigates on success — same
// router-drop-cure pattern as NumericWindowRuleForm.interaction.test.tsx.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createActionMock = vi.fn();
const updateActionMock = vi.fn();

vi.mock("@/app/actions/business-rules", () => ({
  createBusinessRuleAction: (...args: unknown[]) => createActionMock(...args),
  updateBusinessRuleAction: Object.assign((...args: unknown[]) => updateActionMock(...args), {
    bind:
      (_thisArg: unknown, ruleId: string) =>
      (...args: unknown[]) =>
        updateActionMock(ruleId, ...args),
  }),
}));

const navigateMock = vi.fn();
vi.mock("@/lib/ui/full-page-action-nav", () => ({
  navigateAfterActionSuccess: (url: string) => navigateMock(url),
}));

import { MicrochipRequiredForm } from "./MicrochipRequiredForm";

beforeEach(() => {
  createActionMock.mockReset();
  updateActionMock.mockReset();
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

const BASE_PROPS = {
  mode: "create" as const,
  country: "AR",
  province: "Chaco",
  locality: null,
  base: "/gob" as const,
  initialRequired: true,
  initialNotes: "",
};

describe("<MicrochipRequiredForm>", () => {
  it("submits ruleType=microchip_required with required=on by default (checkbox starts checked)", async () => {
    createActionMock.mockResolvedValue({ error: null, redirectTo: "/gob/reglas/AR/Chaco/_" });

    render(<MicrochipRequiredForm {...BASE_PROPS} />);

    expect(
      screen.getByRole("checkbox", { name: "Microchip obligatorio en esta jurisdicción" }),
    ).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Crear regla" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/gob/reglas/AR/Chaco/_");
    });
    const formData = createActionMock.mock.calls[0][1] as FormData;
    expect(formData.get("ruleType")).toBe("microchip_required");
    expect(formData.get("required")).toBe("on");
  });

  it("unchecking the box submits with no 'required' field (parseFromForm reads that as false)", async () => {
    createActionMock.mockResolvedValue({ error: null, redirectTo: "/gob/reglas/AR/Chaco/_" });

    render(<MicrochipRequiredForm {...BASE_PROPS} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Microchip obligatorio en esta jurisdicción" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear regla" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
    const formData = createActionMock.mock.calls[0][1] as FormData;
    expect(formData.get("required")).toBeNull();
  });

  it("edit mode calls updateBusinessRuleAction bound to ruleId", async () => {
    updateActionMock.mockResolvedValue({ error: null, redirectTo: "/gob/reglas/AR/Chaco/_" });

    render(<MicrochipRequiredForm {...BASE_PROPS} mode="edit" ruleId="rule-mc-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
    expect(updateActionMock).toHaveBeenCalledWith(
      "rule-mc-1",
      expect.anything(),
      expect.anything(),
    );
  });

  it("does NOT navigate when the action returns an error", async () => {
    createActionMock.mockResolvedValue({ error: "Rule type inválido" });

    render(<MicrochipRequiredForm {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Crear regla" }));

    await waitFor(() => {
      expect(screen.getByText("Rule type inválido")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
