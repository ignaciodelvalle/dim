// @vitest-environment jsdom
//
// JurisdictionFilterBar — router-drop defect fix (QA sweep, fix/qa-findings-20260702).
// The province/locality/orgType selects (and the time-range chips) used to write
// the URL via `router.replace` inside `startTransition`, which Next 15.5.18's App
// Router can silently drop in production (same defect class documented in
// lib/ui/sheet-nav.ts and cured in components/gob/JurisdictionSwitcher.tsx).
// /gob/page.tsx server-renders its KPI strip from these searchParams, so a
// shallow client-router transition alone would leave stale content on screen.
// The fix bypasses the client router entirely via a full document navigation
// (`window.location.assign`) — this test asserts that mechanism directly and
// that no router method is ever invoked.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const routerReplace = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
  usePathname: () => "/gob",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { JurisdictionFilterBar } from "./JurisdictionFilterBar";

const PROVINCES = [
  { value: "buenos-aires", label: "Buenos Aires" },
  { value: "caba", label: "CABA" },
];

const LOCALITIES = [
  { value: "la-plata", label: "La Plata" },
  { value: "mar-del-plata", label: "Mar del Plata" },
];

const mockAssign = vi.fn();
const originalLocation = window.location;

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
  const current = new URL(url, "http://localhost");
  // jsdom's real window.location.assign performs a navigation it doesn't
  // support ("Not implemented: navigation"), and its `assign` method isn't
  // directly spy-able (non-configurable on the Location object). Replace the
  // whole object with a plain stub that mirrors the fields the component and
  // useSearchParams mock read, plus a jest.fn() for `assign`.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, ...current, assign: mockAssign },
  });
}

function renderBar(overrides: Partial<Parameters<typeof JurisdictionFilterBar>[0]> = {}) {
  return render(
    <JurisdictionFilterBar
      range="mes"
      province=""
      locality=""
      orgType=""
      provinces={PROVINCES}
      localities={[]}
      orgTypes={[]}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
  mockAssign.mockClear();
  setUrl("/gob?range=mes");
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("JurisdictionFilterBar — full navigation on change (router-drop fix)", () => {
  it("selecting a province navigates via window.location.assign, preserving other params", () => {
    setUrl("/gob?range=mes&orgType=refugio");
    renderBar({ orgTypes: [{ value: "refugio", label: "Refugio" }], orgType: "refugio" });

    fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "buenos-aires" } });

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob");
    expect(url.pathname).toBe("/gob");
    expect(url.searchParams.get("range")).toBe("mes");
    expect(url.searchParams.get("orgType")).toBe("refugio");
    expect(url.searchParams.get("province")).toBe("buenos-aires");
  });

  it("selecting a province clears any previously-selected locality", () => {
    setUrl("/gob?range=mes&province=buenos-aires&locality=la-plata");
    renderBar({ province: "buenos-aires", locality: "la-plata", localities: LOCALITIES });

    fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "caba" } });

    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob");
    expect(url.searchParams.get("province")).toBe("caba");
    expect(url.searchParams.get("locality")).toBeNull();
  });

  it("selecting a time-range chip navigates via window.location.assign, preserving province", () => {
    setUrl("/gob?range=mes&province=buenos-aires");
    renderBar({ province: "buenos-aires" });

    fireEvent.click(screen.getByRole("button", { name: "Últimos 30 días" }));

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob");
    expect(url.searchParams.get("range")).toBe("30d");
    expect(url.searchParams.get("province")).toBe("buenos-aires");
  });

  it("never calls router.push/replace/refresh — only the full-navigation path", () => {
    renderBar();

    fireEvent.change(screen.getByLabelText("Provincia"), { target: { value: "buenos-aires" } });

    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
