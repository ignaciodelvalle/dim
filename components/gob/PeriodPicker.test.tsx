// @vitest-environment jsdom
//
// PeriodPicker — router-drop defect fix (adjacent debt from finding 5,
// b0a5c7af, applied here per QA wave-2 item 8a). Preset chips and the custom
// date range used to write the URL via `router.replace`, the exact pattern
// Next 15.5.18's App Router can silently drop in production (same defect
// class documented in lib/ui/sheet-nav.ts). PeriodPicker's dashboards
// (Panorama, vigilancia, etc.) are SERVER-rendered from searchParams, so —
// same reasoning as JurisdictionSwitcher.tsx — the fix bypasses the client
// router entirely via a full document navigation (`window.location.assign`).
// This test asserts that mechanism directly and that no router method is
// ever invoked.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.fn();
const routerReplace = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { PeriodPicker } from "./PeriodPicker";

const mockAssign = vi.fn();
const originalLocation = window.location;

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
  const current = new URL(url, "http://localhost");
  // jsdom's real window.location.assign performs a navigation it doesn't
  // support, and its `assign` method isn't directly spy-able (non-
  // configurable on the Location object) — same workaround as
  // JurisdictionSwitcher.test.tsx.
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, ...current, assign: mockAssign },
  });
}

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();
  routerRefresh.mockClear();
  mockAssign.mockClear();
  setUrl("/gob/vigilancia?jurisdiction=AR-B");
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("PeriodPicker — full navigation on change (router-drop fix)", () => {
  it("selecting a preset navigates via window.location.assign, preserving other params", () => {
    render(<PeriodPicker />);

    fireEvent.click(screen.getByRole("button", { name: "90 días" }));

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob/vigilancia");
    expect(url.searchParams.get("jurisdiction")).toBe("AR-B");
    expect(url.searchParams.get("period")).toBe("90d");
  });

  it("selecting a preset clears any previously-set custom from/to", () => {
    setUrl("/gob/vigilancia?period=custom&from=2026-01-01&to=2026-01-31");
    render(<PeriodPicker />);

    fireEvent.click(screen.getByRole("button", { name: "30 días" }));

    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob/vigilancia");
    expect(url.searchParams.get("period")).toBe("30d");
    expect(url.searchParams.get("from")).toBeNull();
    expect(url.searchParams.get("to")).toBeNull();
  });

  it("completing a custom range navigates via window.location.assign", () => {
    // A full document navigation (the fix) re-mounts the component fresh
    // from the server with the new searchParams — it does NOT re-render an
    // already-mounted instance the way router.replace would have. So this
    // test starts already in the "custom" preset state (as if the previous
    // "Personalizado" click's full navigation had already landed) rather
    // than clicking "Personalizado" and expecting an in-place re-render.
    setUrl("/gob/vigilancia?jurisdiction=AR-B&period=custom");
    render(<PeriodPicker />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-02-01" } });
    mockAssign.mockClear();
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-02-15" } });

    expect(mockAssign).toHaveBeenCalledTimes(1);
    const url = new URL(mockAssign.mock.calls[0][0] as string, "http://localhost/gob/vigilancia");
    expect(url.searchParams.get("period")).toBe("custom");
    expect(url.searchParams.get("from")).toBe("2026-02-01");
    expect(url.searchParams.get("to")).toBe("2026-02-15");
  });

  it("never calls router.replace/push/refresh — only the full-navigation path", () => {
    render(<PeriodPicker />);

    fireEvent.click(screen.getByRole("button", { name: "90 días" }));

    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
