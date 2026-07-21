// @vitest-environment jsdom
//
// DateRangeFilterFields — the Desde/Hasta children-slot control shared by
// /admin/alertas and /admin/auditoria (F-migration 2026-07-21 cluster 2).
// Unlike OpFilterBar's `period` prop (which always resolves to a preset
// default), this control's range has NO default bound — "no from/no to" is
// genuinely unbounded. These tests pin: both fields commit TOGETHER on one
// "Aplicar" submit (not per-keystroke), the ISO value round-trips through the
// dd/mm/aaaa DateInputAr fields, and an optional `resetParamsOnChange` key
// is dropped on commit.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockAssign = vi.fn();
const originalLocation = window.location;

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { DateRangeFilterFields } from "./DateRangeFilterFields";

function setUrl(url: string) {
  window.history.replaceState(null, "", url);
  const current = new URL(url, "http://localhost");
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, ...current, assign: mockAssign },
  });
}

function committedUrl(basePath: string): URL {
  return new URL(mockAssign.mock.calls[0][0] as string, `http://localhost${basePath}`);
}

afterEach(() => {
  cleanup();
  mockAssign.mockClear();
});

describe("<DateRangeFilterFields>", () => {
  it("renders blank Desde/Hasta when no default bound is passed (genuinely unbounded)", () => {
    setUrl("/admin/alertas");
    render(<DateRangeFilterFields />);
    expect((screen.getByLabelText("Desde") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Hasta") as HTMLInputElement).value).toBe("");
  });

  it("commits both from/to together on Aplicar, not per keystroke", () => {
    setUrl("/admin/alertas");
    render(<DateRangeFilterFields />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "01/07/2026" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "15/07/2026" } });
    expect(mockAssign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = committedUrl("/admin/alertas");
    expect(url.searchParams.get("from")).toBe("2026-07-01");
    expect(url.searchParams.get("to")).toBe("2026-07-15");
  });

  it("drops resetParamsOnChange keys (e.g. keyset cursor) on commit", () => {
    setUrl("/admin/auditoria?cursor=abc123");
    render(<DateRangeFilterFields resetParamsOnChange={["cursor"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = committedUrl("/admin/auditoria");
    expect(url.searchParams.get("cursor")).toBeNull();
  });

  it("uses custom fromKey/toKey param names when provided", () => {
    setUrl("/admin/alertas");
    render(<DateRangeFilterFields fromKey="desde" toKey="hasta" />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "01/07/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = committedUrl("/admin/alertas");
    expect(url.searchParams.get("desde")).toBe("2026-07-01");
    expect(url.searchParams.get("from")).toBeNull();
  });

  it("clearing both fields and re-applying removes from/to entirely", () => {
    setUrl("/admin/alertas?from=2026-07-01&to=2026-07-15");
    render(<DateRangeFilterFields fromValue="2026-07-01" toValue="2026-07-15" />);
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = committedUrl("/admin/alertas");
    expect(url.searchParams.get("from")).toBeNull();
    expect(url.searchParams.get("to")).toBeNull();
  });
});
