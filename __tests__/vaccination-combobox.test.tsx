// @vitest-environment jsdom
//
// Cowork B10 — the "Vacuna" field used a native <input list>+<datalist>, whose
// suggestion popup never opened reliably for a human tester (and never at all on
// some devices). It is now an app-controlled combobox: it opens on focus, shows
// the canonical catalog, filters as you type, and still allows free text.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// jsdom has no matchMedia; the LnInput focus handler (scrollControlIntoView)
// calls it. Stub a desktop match so focusing the combobox doesn't throw.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

vi.mock("@/lib/ui/use-idempotency-key", () => ({
  useIdempotencyKey: () => ({ key: "test-idempotency-key" }),
}));
vi.mock("@/lib/ui/use-form-error-focus", () => ({
  useFormErrorFocus: () => ({ current: null }),
}));
vi.mock("@/lib/ui/use-action-redirect", () => ({
  useActionRedirect: () => {},
}));
vi.mock("@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/AttachmentField", () => ({
  AttachmentField: () => React.createElement("div", { "data-testid": "attachment-field" }),
}));
vi.mock("@/components/Icon", () => ({
  Icon: () => React.createElement("span", { "data-testid": "icon" }),
}));

import { VaccinationForm } from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/vacuna/VaccinationForm";

const noopAction = async () => ({ error: null });

afterEach(() => cleanup());

describe("VaccinationForm — vaccine combobox (Cowork B10)", () => {
  it("opens the canonical suggestion list on focus (no typing required)", () => {
    render(React.createElement(VaccinationForm, { action: noopAction, species: "dog" }));

    // No suggestion before focus.
    expect(screen.queryByRole("button", { name: /Antirrábica/i })).toBeNull();

    fireEvent.focus(screen.getByPlaceholderText(/Empezá a tipear/i));

    // Canonical dog vaccines are present — Antirrábica leads the catalog.
    expect(screen.getByRole("button", { name: /Antirrábica/i })).toBeInTheDocument();
    // Dog list is filtered by species (never the cat-only ones).
    expect(screen.queryByRole("button", { name: /Triple felina/i })).toBeNull();
  });

  it("filters as you type and lets you pick a suggestion", () => {
    render(React.createElement(VaccinationForm, { action: noopAction, species: "dog" }));

    const input = screen.getByPlaceholderText(/Empezá a tipear/i) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "anti" } });

    const option = screen.getByRole("button", { name: /Antirrábica/i });
    // onMouseDown drives the selection (fires before the input's onBlur closes it).
    fireEvent.mouseDown(option);

    expect(input.value).toBe("Antirrábica");
    // List closes after a pick.
    expect(screen.queryByRole("button", { name: /Antirrábica/i })).toBeNull();
  });

  it("still allows free text that is not in the catalog", () => {
    render(React.createElement(VaccinationForm, { action: noopAction, species: "dog" }));

    const input = screen.getByPlaceholderText(/Empezá a tipear/i) as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Vacuna experimental X" } });

    expect(input.value).toBe("Vacuna experimental X");
  });
});
