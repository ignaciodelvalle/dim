// @vitest-environment jsdom
//
// ConsultaSinTurnoSheet — router-drop cure port (same pattern as
// app/(app)/mis-mascotas/[publicToken]/SheetMounter.tsx). Asserts closing
// calls closeSheetNav with a URL that strips only `sheet` while preserving
// unrelated params, and that router.push/replace/refresh are never invoked.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routerPush, routerReplace, routerRefresh, closeSheetNav } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  closeSheetNav: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/refugios/refugio-abc",
  useSearchParams: () => new URLSearchParams("sheet=consulta-sin-turno&foo=bar"),
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
}));

vi.mock("@/lib/ui/sheet-nav", () => ({
  closeSheetNav,
}));

import { ConsultaSinTurnoSheet } from "./ConsultaSinTurnoSheet";

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
  closeSheetNav.mockClear();
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
});

describe("<ConsultaSinTurnoSheet> — close (router-hot-path fix)", () => {
  it("clicking Cerrar calls closeSheetNav with `sheet` stripped, preserving other params, and never touches the router", () => {
    render(
      <ConsultaSinTurnoSheet
        orgDisplayName="Refugio Abc"
        orgEmail="hola@refugio.org"
        orgPhone="+541111111111"
        jurisdictionLabel="CABA"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(closeSheetNav).toHaveBeenCalledWith("/refugios/refugio-abc?foo=bar");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
