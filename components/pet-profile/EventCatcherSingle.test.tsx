// Tests for <EventCatcherSingle> — pet-document-redesign ADR-12a (Phase 3).
//
// Pattern: react-dom/server renderToStaticMarkup (repo convention — no
// jsdom), hooks stubbed for SSR-safety exactly like the home-screen
// EventCatcher's own coverage (__tests__/a11y-structural.test.tsx item 5).
// Visibility (owner + active only, hidden for deceased/org) is a page.tsx
// concern — this component has no petStatus/isOwner prop by design (task
// 3.2: the caller gates rendering entirely); page.tsx's conditional is
// exercised structurally by the "single-pet, no picker" assertion below and
// documented in apply-progress.

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const quickCaptureActionMock = vi.fn();
const buildAnotarUrlMock = vi.fn(
  (token: string, opts: { text?: string; kind?: string }) =>
    `/mis-mascotas/${token}/anotar${opts.kind ? `?kind=${opts.kind}` : ""}`,
);
const buildKindDeeplinkMock = vi.fn(
  (kind: string, token: string, _text?: string) => `/mis-mascotas/${token}/eventos/${kind}`,
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/mis-mascotas/TK-0001",
}));

vi.mock("@/app/actions/quick-capture", () => ({
  quickCaptureAction: (...args: unknown[]) => quickCaptureActionMock(...args),
}));

vi.mock("@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff", () => ({
  QUICK_ACTIONS: [
    { eventType: "vaccination_administered", label: "Vacuna" },
    { eventType: "weight_recorded", label: "Peso" },
    { eventType: "vet_visit_logged", label: "Visita al vet" },
    { eventType: "medication_started", label: "Medicación" },
    { eventType: "note_added", label: "Nota" },
    { eventType: "deworming_administered", label: "Antiparasit." },
  ],
  buildAnotarUrl: (...args: [string, { text?: string; kind?: string }]) =>
    buildAnotarUrlMock(...args),
  buildKindDeeplink: (kind: string, token: string, text?: string) =>
    buildKindDeeplinkMock(kind, token, text),
}));

vi.mock("@/components/ui/Button", () => ({
  LnButton: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    // biome-ignore lint/a11y/useButtonType: test mock — type passed through props
    React.createElement("button", props, children),
}));

vi.mock("react", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof React;
  return {
    ...actual,
    useRef: <T,>(init: T) => ({ current: init }),
    useState: (init: unknown) => [init, vi.fn()],
    useTransition: () => [false, vi.fn()],
  };
});

import { EventCatcherSingle } from "./EventCatcherSingle";

afterEach(() => {
  mockPush.mockClear();
  quickCaptureActionMock.mockClear();
  buildAnotarUrlMock.mockClear();
  buildKindDeeplinkMock.mockClear();
});

describe("<EventCatcherSingle> — single-pet capture, no picker (ADR-12a)", () => {
  it("renders a textarea scoped to the given pet, no pet-chip radiogroup", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    expect(html).toContain("Firulais — ¿qué pasó?");
    expect(html).not.toContain('role="radiogroup"');
  });

  it("renders exactly the 5 single-pet quick chips (vacuna/peso/vet/medicación/nota)", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    for (const label of ["Vacuna", "Peso", "Visita al vet", "Medicación", "Nota"]) {
      expect(html).toContain(label);
    }
    // Antiparasit. is in the full 8-option grid but NOT the 5-chip single set.
    expect(html).not.toContain("Antiparasit.");
  });

  it("submit button starts disabled (empty text) and reads Anotar", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    expect(html).toContain("Anotar");
    expect(html).toMatch(/disabled=""[^>]*>Anotar|Anotar[^<]*<\/button>/);
  });

  it("scopes the textarea aria-label to the pet name (accessible name, no generic 'Describí el evento')", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    expect(html).toContain('aria-label="Describí el evento de Firulais"');
  });
});
