// Structural smoke tests for <FinderInPossessionForm> (P0e).
//
// Render via react-dom/server → HTML string (same pattern as PetSightingForm).
// useActionState and useState are stubbed so the component renders predictably
// without jsdom.
//
// Assertions focus on:
//   - Required fields: finderName, finderPhone, finderEmail, petCondition
//   - LocationFields is rendered (l2 mode — exact-point map picker)
//   - canKeepIndefinite checkbox + canKeepUntil datetime-local
//   - Photo file input in the collapsible group
//   - Success state: thank-you message + back link
//   - Logged-in banner renders when loggedIn=true + prefill.displayName
//   - Prefilled values render as defaultValue on inputs

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Stub useActionState and useState before importing the component.
// ---------------------------------------------------------------------------

const mockUseActionState = vi.fn();
// useState stub: returns [initialValue, setter] for all calls.
// We need canKeepIndefinite to default to false so the datetime input renders.
const mockUseState = vi.fn((initialValue: unknown) => [initialValue, vi.fn()]);

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof React;
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useActionState: (...args: any[]) => mockUseActionState(...args),
    useState: (initialValue: unknown) => mockUseState(initialValue),
  };
});

vi.mock("@/app/(public)/p/[publicToken]/encontre/action", () => ({
  reportFinderInPossessionAction: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

// LocationFields relies on hooks and dynamic imports; stub it for SSR render.
vi.mock("@/components/LocationFields", () => ({
  LocationFields: ({
    mode,
  }: {
    mode: string;
  }) => React.createElement("div", { "data-testid": "location-fields", "data-mode": mode }),
}));

import { FinderInPossessionForm } from "@/app/(public)/p/[publicToken]/encontre/FinderInPossessionForm";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

const BASE_PROPS = {
  publicToken: "DIM-P0E-001",
  petName: "Luna",
  biasProvince: "Buenos Aires",
  biasLocality: "La Plata",
};

const INITIAL_STATE = { ok: false as const, error: null };
const formActionStub = () => {};

describe("<FinderInPossessionForm> — initial state (form render)", () => {
  beforeEach(() => {
    mockUseActionState.mockReturnValue([INITIAL_STATE, formActionStub, false]);
    mockUseState.mockImplementation((initialValue: unknown) => [initialValue, vi.fn()]);
  });

  it("renders finderName, finderPhone, finderEmail inputs", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain('name="finderName"');
    expect(html).toContain('name="finderPhone"');
    expect(html).toContain('name="finderEmail"');
  });

  it("renders all four petCondition radio options", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain('value="bien"');
    expect(html).toContain('value="herida"');
    expect(html).toContain('value="asustada"');
    expect(html).toContain('value="necesita_vet_urgente"');
  });

  it("renders the location fields (L2 mode — exact point)", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain("location-fields");
    expect(html).toContain('data-mode="l2"');
  });

  it("renders the canKeepIndefinite checkbox", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain("canKeepIndefiniteToggle");
    expect(html).toContain("indefinidamente");
  });

  it("renders the datetime-local input when canKeepIndefinite is false (default)", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain('name="canKeepUntil"');
    expect(html).toContain('type="datetime-local"');
  });

  it("renders the photo file input inside collapsible group", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain('name="photoNow"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
  });

  it("renders the optional message textarea", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain('name="message"');
  });

  it("renders the submit button with text-white on azul (a11y contrast)", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    const buttonMatch = html.match(/<button[^>]*type="submit"[^>]*class="([^"]+)"/);
    expect(buttonMatch).not.toBeNull();
    expect(buttonMatch?.[1]).toContain("text-white");
  });

  it("does NOT render the logged-in banner when loggedIn=false (default)", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).not.toContain("Estás enviando como");
  });
});

describe("<FinderInPossessionForm> — logged-in prefill", () => {
  beforeEach(() => {
    mockUseActionState.mockReturnValue([INITIAL_STATE, formActionStub, false]);
    mockUseState.mockImplementation((initialValue: unknown) => [initialValue, vi.fn()]);
  });

  it("renders the logged-in banner when loggedIn=true and displayName set", () => {
    const html = render(
      <FinderInPossessionForm
        {...BASE_PROPS}
        loggedIn
        prefill={{
          displayName: "María García",
          name: "María García",
          phone: "11-0000",
          email: "m@g.com",
        }}
      />,
    );
    expect(html).toContain("Estás enviando como");
    expect(html).toContain("María García");
  });

  it("prefills finderName defaultValue from props.prefill.name", () => {
    const html = render(
      <FinderInPossessionForm
        {...BASE_PROPS}
        loggedIn
        prefill={{ name: "Pedro Sosa", displayName: "Pedro Sosa" }}
      />,
    );
    expect(html).toContain('value="Pedro Sosa"');
  });
});

describe("<FinderInPossessionForm> — success state", () => {
  beforeEach(() => {
    mockUseActionState.mockReturnValue([{ ok: true as const, error: null }, formActionStub, false]);
    mockUseState.mockImplementation((initialValue: unknown) => [initialValue, vi.fn()]);
  });

  it("renders the success thank-you message", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain("¡Gracias!");
    expect(html).toContain("Le avisamos al dueño/a");
  });

  it("renders the back link to the pet profile", () => {
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain("/p/DIM-P0E-001");
    expect(html).toContain("Luna");
  });

  it("shows non-fatal photo warning when state.warning is set", () => {
    mockUseActionState.mockReturnValue([
      {
        ok: true as const,
        error: null,
        warning: "No se pudo subir la foto, pero el aviso fue registrado igual.",
      },
      formActionStub,
      false,
    ]);
    const html = render(<FinderInPossessionForm {...BASE_PROPS} />);
    expect(html).toContain("No se pudo subir la foto");
  });
});
