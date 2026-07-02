// @vitest-environment jsdom
//
// PetDetailTabsPanel interaction test — router-hot-path fix for the
// FlipCard "Girar" button, which is the ONLY face switcher since wave-3 P2
// (PO decision #645 removed the Credencial|Libreta tab title bar). Same
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
  // Sanity net: if either click path (Girar / tab buttons) falls back to
  // router.push/replace, these spies make that regression visible. Note
  // PetDetailTabsPanel's legacy-hash-sync effect (unrelated to this task's
  // click paths) still legitimately calls router.replace on mount when a
  // recognized hash is present — tests below don't set a hash, so that
  // effect is a no-op and these spies stay untouched by it.
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

  // FlipCard's height-sync effect and Vaul-adjacent matchMedia checks need
  // these jsdom polyfills — same as FlipCard.test.tsx / SheetHost.interaction.test.tsx.
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

  it("clicking Girar flips the face and updates the URL to ?tab=libreta&lente=todo — no router involved", () => {
    renderPanel("credencial");

    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Girar a Libreta" }));

    expect(window.location.search).toBe("?tab=libreta&lente=todo");
    const flipped = screen.getByRole("button", { name: "Girar a Credencial" });
    expect(flipped).toBeInTheDocument();
    expect(flipped).toHaveAttribute("aria-pressed", "true");
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("clicking Girar again flips back to Credencial and strips ?tab=/?lente=", () => {
    renderPanel("credencial");

    fireEvent.click(screen.getByRole("button", { name: "Girar a Libreta" }));
    expect(window.location.search).toBe("?tab=libreta&lente=todo");

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
    expect(window.location.search).toBe("?tab=libreta&lente=todo");

    act(() => {
      window.history.back();
    });

    // jsdom (like real browsers) processes history navigation as a queued
    // task — assertions after it need waitFor (see SheetHost.interaction.test.tsx).
    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
    expect(screen.getByRole("button", { name: "Girar a Libreta" })).toBeInTheDocument();
  });

  it("does not render a Credencial|Libreta tab title bar — the flip button is the only switcher", () => {
    renderPanel("credencial");

    expect(screen.queryByRole("button", { name: "Credencial" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Libreta" })).not.toBeInTheDocument();
  });
});

describe("PetDetailTabsPanel — deep-link parity (unaffected by the router-hot-path fix)", () => {
  it("a direct load with ?tab=vacunas already in the URL renders the Libreta face without any click", () => {
    window.history.replaceState(null, "", "/mis-mascotas/abc123?tab=vacunas");
    renderPanel("libreta");

    expect(screen.getByRole("button", { name: "Girar a Credencial" })).toBeInTheDocument();
  });
});
