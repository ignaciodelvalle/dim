// @vitest-environment jsdom
//
// Regression test for the Ciudadano Cero QA (2026-07-08): "step 3 (map/address)
// and step 5 coexist on screen". Step 3 is deliberately kept MOUNTED across step
// transitions (its LocationFields inputs are uncontrolled and read via FormData
// at submit), so the gating must guarantee that when the wizard is NOT on step 3
// the step-3 subtree is visually hidden (offscreen + aria-hidden + inert) and
// exactly one step's content is on screen.
//
// This drives the real wizard from step 1 → step 5 and asserts single-step
// visibility. LocationFields (MapLibre) and the server action are stubbed so the
// test stays deterministic and DOM-only.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/LocationFields", () => ({
  LocationFields: () => <div data-testid="location-fields" />,
}));

vi.mock("@/src/modules/welfare/actions", () => ({
  createWelfareReportAction: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/ui/use-idempotency-key", () => ({
  useIdempotencyKey: () => ({ key: "test-idempotency-key" }),
}));

vi.mock("@/lib/ui/denuncia-autosave", () => ({
  restoreDraft: () => null,
  saveDraft: vi.fn(),
  clearDraft: vi.fn(),
}));

import { DenunciaWizard } from "@/app/(public)/denuncias/nueva/DenunciaWizard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function clickContinue() {
  fireEvent.click(screen.getByRole("button", { name: "Continuar →" }));
}

describe("DenunciaWizard — step gating (single step visible)", () => {
  it("hides step 3 offscreen when the wizard advances to step 5", () => {
    render(<DenunciaWizard />);

    // Step 1 — pick a kind, continue.
    fireEvent.click(document.querySelector('input[name="kindCard"][value="other"]')!);
    clickContinue();

    // Step 2 — pick a severity, continue.
    fireEvent.click(document.querySelector('input[name="severityCard"][value="moderado"]')!);
    clickContinue();

    // Step 3 — description (>= 20 chars) + when, continue.
    fireEvent.change(document.querySelector('textarea[name="description"]')!, {
      target: { value: "Perro sin agua bajo el sol intenso" },
    });
    fireEvent.click(document.querySelector('input[name="occurredAtOption"][value="now"]')!);
    clickContinue();

    // Step 4 — optional, continue.
    clickContinue();

    // Now on step 5. Assert single-step visibility.
    const sendHeading = screen.getByText("¿Cómo querés enviarla?");
    expect(sendHeading.closest('[aria-hidden="true"]')).toBeNull();

    // Step 3 stays mounted (uncontrolled inputs) but is hidden: its heading lives
    // inside an aria-hidden + inert offscreen subtree.
    const whereHeading = screen.getByText("¿Dónde y cuándo?");
    const hiddenWrapper = whereHeading.closest('[aria-hidden="true"]');
    expect(hiddenWrapper).not.toBeNull();
    expect(hiddenWrapper).toHaveAttribute("inert");

    // Earlier steps are fully unmounted — not just hidden.
    expect(screen.queryByText("¿Qué pasó?")).toBeNull();
    expect(screen.queryByText("¿Qué tan grave es?")).toBeNull();
  });
});
