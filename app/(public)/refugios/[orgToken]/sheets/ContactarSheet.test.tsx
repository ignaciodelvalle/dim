// @vitest-environment jsdom
//
// ContactarSheet — router-drop cure port (same pattern as
// app/(app)/mis-mascotas/[publicToken]/SheetMounter.tsx). This sheet has
// TWO close paths: the "Cerrar" button (immediate) and a 4s auto-close timer
// that fires after a successful submit. Both used router.replace; both are
// now closeSheetNav (shallow — the org contact form doesn't mutate any
// server-rendered content elsewhere on this page, so no full-reload variant
// is needed here, unlike MisTurnosSheetMounter's post-cancel close).

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routerPush, routerReplace, routerRefresh, closeSheetNav } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  closeSheetNav: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/refugios/refugio-abc",
  useSearchParams: () => new URLSearchParams("sheet=contactar&foo=bar"),
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
}));

vi.mock("@/lib/ui/sheet-nav", () => ({
  closeSheetNav,
}));

const submitOrgContactAction = vi.fn();
vi.mock("@/src/modules/organizations/actions", () => ({
  submitOrgContactAction: (...args: unknown[]) => submitOrgContactAction(...args),
}));

import { ContactarSheet } from "./ContactarSheet";

beforeEach(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }));
  globalThis.ResizeObserver =
    globalThis.ResizeObserver ??
    (class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  closeSheetNav.mockClear();
  submitOrgContactAction.mockClear();
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
});

describe("<ContactarSheet> — sheet=contactar", () => {
  it("clicking Cerrar calls closeSheetNav with `sheet` stripped, preserving other params, and never touches the router", () => {
    render(
      <ContactarSheet
        orgToken="refugio-abc"
        orgDisplayName="Refugio Abc"
        orgEmail="hola@refugio.org"
        orgPhone="+541111111111"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(closeSheetNav).toHaveBeenCalledWith("/refugios/refugio-abc?foo=bar");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });

  it("auto-closes via closeSheetNav 4s after a successful submit, never via router.replace", async () => {
    // Fake timers from the start (with time-advancing microtasks) so the
    // effect's setTimeout is one this clock controls — findByText's
    // real-timer-based polling would otherwise deadlock against it.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    submitOrgContactAction.mockResolvedValue({ ok: true, error: null });

    render(
      <ContactarSheet
        orgToken="refugio-abc"
        orgDisplayName="Refugio Abc"
        orgEmail="hola@refugio.org"
        orgPhone="+541111111111"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Tu email/), { target: { value: "vos@ejemplo.com" } });
    fireEvent.change(screen.getByLabelText(/Mensaje/), {
      target: { value: "Hola, quiero ayudar." },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    });

    expect(screen.getByText("Mensaje enviado.")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(closeSheetNav).toHaveBeenCalledWith("/refugios/refugio-abc?foo=bar");
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
