// @vitest-environment jsdom
//
// PetDetailTabsPanel interaction test — router-hot-path fix for the two face
// switchers restored by the "Una sola libreta" redesign: the band "Girar" turn
// button (DocumentChrome) and the segmented Credencial/Libreta tablist. Both
// write ?tab= through the same goToFace (native History API). Same
// defect class as SheetHost.interaction.test.tsx's sheets: Next 15.5.x's
// App Router can silently drop a router.replace transition's own fetch in
// production (see lib/ui/sheet-nav.ts's module docblock). The Girar click
// path writes the URL via pushTabUrl (native History API) instead of
// router.replace — this file exercises the real click-driven path (RTL +
// jsdom) the way a production user would, and explicitly asserts that
// browser back restores the previous face (a popstate → useSearchParams()
// reactivity property that must not be assumed — see task contract). It
// also asserts the button's aria-pressed state, since the flip control now
// carries the full accessible-nav contract the removed tablist used to own.
//
// next/navigation is mocked the same way as SheetHost.interaction.test.tsx:
// jsdom's real history.pushState/replaceState is wrapped to notify
// subscribed components, mirroring Next's own patch. useRouter's
// push/replace are spies — a sanity net that fails loudly if either click
// path regresses back onto the router.

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

function usePseudoRouterSubscription() {
  const [, forceRender] = React.useState(0);
  React.useEffect(() => {
    const onChange = () => forceRender((n) => n + 1);
    listeners.add(onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
}

const routerPush = vi.fn();
const routerReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => {
    usePseudoRouterSubscription();
    return window.location.pathname;
  },
  useSearchParams: () => {
    usePseudoRouterSubscription();
    return new URLSearchParams(window.location.search);
  },
  // Sanity net: if either click path (Girar / tab buttons) — or the
  // legacy-hash-sync mount effect, ported to replaceTabUrl (native History
  // API) in the same router-drop cure — ever falls back to
  // router.push/replace, these spies make that regression visible.
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
}));

vi.mock("@/app/actions/pet-tab-data", () => ({
  getLibretaFaceData: vi.fn().mockResolvedValue({ ok: false, error: "not needed for this test" }),
}));

import { PetDetailTabsPanel } from "@/components/pet-profile/PetDetailTabsPanel";

let originalPushState: typeof window.history.pushState;
let originalReplaceState: typeof window.history.replaceState;

beforeEach(() => {
  routerPush.mockClear();
  routerReplace.mockClear();

  // matchMedia reports REDUCED motion so FlipCard's edge-on turn resolves as an
  // INSTANT face swap — the displayed face (and its band turn button) updates
  // synchronously within the click's act(), instead of after the ~485ms
  // animation timers. This test exercises the router/nav contract, not the
  // animation; the instant path keeps every assertion synchronous. (Overwrite
  // unconditionally — jsdom ships no matchMedia, but a prior test may have set
  // a matches:false stub that must not win here.)
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver =
    globalThis.ResizeObserver ??
    (class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver);

  window.history.replaceState(null, "", "/mis-mascotas/abc123");
  originalPushState = window.history.pushState.bind(window.history);
  originalReplaceState = window.history.replaceState.bind(window.history);
  // Mirrors Next's own patch: notify subscribers after a shallow URL change.
  window.history.pushState = (...args: Parameters<typeof window.history.pushState>) => {
    originalPushState(...args);
    notify();
  };
  window.history.replaceState = (...args: Parameters<typeof window.history.replaceState>) => {
    originalReplaceState(...args);
    notify();
  };
});

afterEach(() => {
  cleanup();
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  listeners.clear();
});

function renderPanel(initialFace: "credencial" | "libreta" = "credencial") {
  return render(
    <PetDetailTabsPanel
      petPublicToken="abc123"
      credencialContent={<div>CREDENCIAL-CONTENT</div>}
      initialFace={initialFace}
      isOwner
    />,
  );
}

describe("PetDetailTabsPanel — Girar affordance (router-hot-path fix)", () => {
  it("starts on Credencial with aria-pressed=false (Libreta not active)", () => {
    renderPanel("credencial");

    expect(screen.getByRole("button", { name: "Girar a Libreta" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicking Girar flips the face and updates the URL to ?tab=libreta — no router involved", () => {
    renderPanel("credencial");

    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Girar a Libreta" }));

    expect(window.location.search).toBe("?tab=libreta");
    const flipped = screen.getByRole("button", { name: "Girar a Credencial" });
    expect(flipped).toBeInTheDocument();
    expect(flipped).toHaveAttribute("aria-pressed", "true");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("clicking Girar again flips back to Credencial and strips ?tab=/?lente=", () => {
    renderPanel("credencial");

    fireEvent.click(screen.getByRole("button", { name: "Girar a Libreta" }));
    expect(window.location.search).toBe("?tab=libreta");

    fireEvent.click(screen.getByRole("button", { name: "Girar a Credencial" }));
    expect(window.location.search).toBe("");
    const flipped = screen.getByRole("button", { name: "Girar a Libreta" });
    expect(flipped).toBeInTheDocument();
    expect(flipped).toHaveAttribute("aria-pressed", "false");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("browser back after a Girar click restores the previous face via popstate", async () => {
    renderPanel("credencial");

    fireEvent.click(screen.getByRole("button", { name: "Girar a Libreta" }));
    expect(window.location.search).toBe("?tab=libreta");

    act(() => {
      window.history.back();
    });

    // jsdom (like real browsers) processes history navigation as a queued
    // task — assertions after it need waitFor (see SheetHost.interaction.test.tsx).
    // The face swap (displayedFace) lags the URL by an effect tick, so await the
    // restored front turn button too rather than asserting it synchronously.
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Girar a Libreta" })).toBeInTheDocument();
    });
  });

  it("renders the segmented Credencial/Libreta tablist in sync with the band turn button", () => {
    // The "Una sola libreta" redesign restored a visible segmented control
    // alongside the band turn button; both write ?tab= through the same
    // goToFace, so aria-selected on the tablist tracks the active face.
    renderPanel("credencial");

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    const [credencialTab, libretaTab] = tabs;
    expect(credencialTab).toHaveAttribute("aria-selected", "true");
    expect(libretaTab).toHaveAttribute("aria-selected", "false");

    // Clicking the Libreta tab flips the face via the History API (no router).
    fireEvent.click(libretaTab);
    expect(window.location.search).toBe("?tab=libreta");
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("wires each tab to its face panel (aria-controls ↔ id) with roving tabIndex", () => {
    renderPanel("credencial");
    const [credencialTab, libretaTab] = screen.getAllByRole("tab");

    // aria-controls points at the tabpanel FlipCard renders for that face.
    expect(credencialTab).toHaveAttribute("aria-controls", "pet-face-credencial");
    expect(libretaTab).toHaveAttribute("aria-controls", "pet-face-libreta");
    // Roving tabIndex: only the active tab is in the tab order.
    expect(credencialTab).toHaveAttribute("tabindex", "0");
    expect(libretaTab).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight on the tablist moves to and activates the Libreta face", () => {
    renderPanel("credencial");
    const tablist = screen.getByRole("tablist");

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(window.location.search).toBe("?tab=libreta");
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("aria-selected", "true");
    // Roving tabIndex follows the active tab.
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("tabindex", "0");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe("PetDetailTabsPanel — deep-link parity (unaffected by the router-hot-path fix)", () => {
  it("a direct load with ?tab=vacunas already in the URL renders the Libreta face without any click", () => {
    window.history.replaceState(null, "", "/mis-mascotas/abc123?tab=vacunas");
    renderPanel("libreta");

    expect(screen.getByRole("button", { name: "Girar a Credencial" })).toBeInTheDocument();
  });
});

describe("PetDetailTabsPanel — legacy #hash mount migration (replaceTabUrl, router-hot-path fix)", () => {
  it("a legacy #libreta hash on load normalizes the URL via history.replaceState — no router.replace involved", async () => {
    window.history.replaceState(null, "", "/mis-mascotas/abc123#libreta");
    renderPanel("credencial");

    await waitFor(() => {
      expect(window.location.search).toBe("?tab=libreta");
    });
    expect(routerReplace).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });
});
