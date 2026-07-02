// Tests for <EventCatcherSingle> — pet-document-redesign ADR-12a (Phase 3);
// wave-3 P4 (PO decision #645 point 4) dropped the quick-chip row — the
// textarea and the Anotar control now sit at the same level, in an LnCard.
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/mis-mascotas/TK-0001",
}));

vi.mock("@/app/actions/quick-capture", () => ({
  quickCaptureAction: (...args: unknown[]) => quickCaptureActionMock(...args),
}));

vi.mock("@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff", () => ({
  buildAnotarUrl: (...args: [string, { text?: string; kind?: string }]) =>
    buildAnotarUrlMock(...args),
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
    useState: (init: unknown) => [init, vi.fn()],
    useTransition: () => [false, vi.fn()],
  };
});

import { EventCatcherSingle } from "./EventCatcherSingle";

afterEach(() => {
  mockPush.mockClear();
  quickCaptureActionMock.mockClear();
  buildAnotarUrlMock.mockClear();
});

describe("<EventCatcherSingle> — single-pet capture, no picker (ADR-12a)", () => {
  it("renders a textarea scoped to the given pet, no pet-chip radiogroup", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    expect(html).toContain("Firulais — ¿qué pasó?");
    expect(html).not.toContain('role="radiogroup"');
  });

  it("renders no quick chips — the textarea and Anotar sit at the same level (wave-3 P4)", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    for (const label of ["Vacuna", "Peso", "Visita al vet", "Medicación", "Nota", "Antiparasit."]) {
      expect(html).not.toContain(label);
    }
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

  it("textarea and Anotar render in the same row, inside an LnCard (design finding 6)", () => {
    const html = renderToStaticMarkup(
      <EventCatcherSingle petPublicToken="TK-0001" petName="Firulais" />,
    );
    // LnCard's own border/bg classes (components/ui/Card.tsx) confirm the
    // migration off the hand-rolled bordered <section>.
    expect(html).toContain("border-[var(--color-ln-line)]");
    // One-row layout: textarea and the Anotar button share a flex row.
    const rowStart = html.indexOf('class="flex items-end gap-3');
    const textareaPos = html.indexOf("Firulais — ¿qué pasó?");
    const anotarPos = html.indexOf(">Anotar<");
    expect(rowStart).toBeGreaterThan(-1);
    expect(textareaPos).toBeGreaterThan(rowStart);
    expect(anotarPos).toBeGreaterThan(textareaPos);
  });
});
