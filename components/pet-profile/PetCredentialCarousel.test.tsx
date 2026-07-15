// @vitest-environment jsdom
//
// PetCredentialCarousel interaction tests (owner-ia-redesign P4). Renders the
// real shell in jsdom and drives the chrome: position dots (count / cap / tint /
// current emphasis, in ranked order), keyboard ←/→ navigation (with end-clamp),
// tap-to-jump, and the one-neighbor-each-side prefetch. next/navigation is
// mocked to observe router.push / router.prefetch — the exact calls the swipe /
// arrow / key / dot paths make.
//
// Owner-only gating (no chrome for a non-owner) is proven purely in
// lib/domain/owner-carousel.test.ts (shouldShowCarousel): the page never mounts
// this component for a non-owner, so there is no chrome to render.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CarouselPet } from "@/lib/domain/owner-carousel";
import { PetCredentialCarousel } from "./PetCredentialCarousel";

const { push, prefetch } = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch }),
}));

const PETS: CarouselPet[] = [
  { token: "DIM-LOST-0001", status: "lost" },
  { token: "DIM-PREG-0002", status: "pregnant" },
  { token: "DIM-OKAY-0003", status: "ok" },
];

function renderCarousel(currentToken: string, pets: CarouselPet[] = PETS) {
  return render(
    <PetCredentialCarousel pets={pets} currentToken={currentToken}>
      <div data-testid="document">documento</div>
    </PetCredentialCarousel>,
  );
}

function dots(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="pet-carousel-chrome"] ul li button',
    ),
  );
}

afterEach(() => {
  cleanup();
  push.mockClear();
  prefetch.mockClear();
});

describe("PetCredentialCarousel — position dots", () => {
  it("renders one dot per pet, in the ranked order given", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    const rendered = dots(container);
    expect(rendered).toHaveLength(PETS.length);
    // Tint follows status IN ORDER: lost (err) → pregnant (rosa) → ok (ok).
    expect(rendered[0].innerHTML).toContain("bg-[var(--color-ln-err)]");
    expect(rendered[1].innerHTML).toContain("bg-[var(--color-ln-rosa)]");
    expect(rendered[2].innerHTML).toContain("bg-[var(--color-ln-ok)]");
  });

  it("caps at the 8 dots it is given (cap is enforced upstream in rankOwnerCarousel)", () => {
    const eight: CarouselPet[] = Array.from({ length: 8 }, (_, i) => ({
      token: `DIM-PET-000${i}`,
      status: "ok",
    }));
    const { container } = renderCarousel("DIM-PET-0000", eight);
    expect(dots(container)).toHaveLength(8);
  });

  it("emphasizes exactly the current pet's dot (aria-current)", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    const current = dots(container).filter((d) => d.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("data-current", "true");
    // The emphasized dot is the SECOND one (the current token's rank position).
    expect(dots(container)[1]).toHaveAttribute("aria-current", "true");
  });

  it("tapping a dot navigates to that pet's real route", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    fireEvent.click(dots(container)[2]);
    expect(push).toHaveBeenCalledWith("/mis-mascotas/DIM-OKAY-0003");
  });
});

describe("PetCredentialCarousel — keyboard navigation (clamp at ends, no wrap)", () => {
  it("ArrowRight goes to the next pet, ArrowLeft to the previous", () => {
    renderCarousel("DIM-PREG-0002");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(push).toHaveBeenCalledWith("/mis-mascotas/DIM-OKAY-0003");
    push.mockClear();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).toHaveBeenCalledWith("/mis-mascotas/DIM-LOST-0001");
  });

  it("ArrowLeft at the first pet is a no-op (clamp — does not wrap to the last)", () => {
    renderCarousel("DIM-LOST-0001");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(push).not.toHaveBeenCalled();
  });

  it("ArrowRight at the last pet is a no-op (clamp — does not wrap to the first)", () => {
    renderCarousel("DIM-OKAY-0003");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores arrow keys originating from a roving tablist (Credencial/Libreta faces)", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    const tab = document.createElement("button");
    tab.setAttribute("role", "tab");
    container.appendChild(tab);
    fireEvent.keyDown(tab, { key: "ArrowRight" });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("PetCredentialCarousel — pointer swipe gated under open sheets", () => {
  function chromeOf(container: HTMLElement): HTMLElement {
    return container.querySelector<HTMLElement>('[data-testid="pet-carousel-chrome"]')!;
  }

  it("navigates on a horizontal swipe that starts in a swipe zone (no sheet open)", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    const chrome = chromeOf(container);
    // Swipe left (dx negative, clears the 48px threshold) → NEXT (less urgent).
    fireEvent.pointerDown(chrome, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(chrome, { clientX: 40, clientY: 100 });
    expect(push).toHaveBeenCalledWith("/mis-mascotas/DIM-OKAY-0003");
  });

  it("does NOT navigate on the same swipe while a dialog/sheet is open", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    const chrome = chromeOf(container);
    fireEvent.pointerDown(chrome, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(chrome, { clientX: 40, clientY: 100 });
    expect(push).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("does NOT navigate while a Vaul drawer is mounted", () => {
    const { container } = renderCarousel("DIM-PREG-0002");
    const drawer = document.createElement("div");
    drawer.setAttribute("data-vaul-drawer", "");
    document.body.appendChild(drawer);
    const chrome = chromeOf(container);
    fireEvent.pointerDown(chrome, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(chrome, { clientX: 40, clientY: 100 });
    expect(push).not.toHaveBeenCalled();
    drawer.remove();
  });

  it("does NOT navigate while a native <dialog open> is mounted (ConfirmDialog has no explicit role)", () => {
    // W1 review fix bar 2026-07-15: ConfirmDialog (components/ui/ConfirmDialog)
    // renders a bare native <dialog> — no role="dialog" attribute, since the
    // element already carries implicit ARIA dialog semantics. The gate selector
    // used to miss it entirely, so a swipe over an open ConfirmDialog could
    // still navigate to a neighbor pet mid-confirmation.
    const { container } = renderCarousel("DIM-PREG-0002");
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.appendChild(dialog);
    const chrome = chromeOf(container);
    fireEvent.pointerDown(chrome, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(chrome, { clientX: 40, clientY: 100 });
    expect(push).not.toHaveBeenCalled();
    dialog.remove();
  });
});

describe("PetCredentialCarousel — desktop arrows", () => {
  it("disables the previous arrow at the first pet and the next arrow at the last", () => {
    const first = renderCarousel("DIM-LOST-0001");
    expect(first.getByLabelText("Mascota anterior")).toBeDisabled();
    expect(first.getByLabelText("Mascota siguiente")).not.toBeDisabled();
    cleanup();
    const last = renderCarousel("DIM-OKAY-0003");
    expect(last.getByLabelText("Mascota siguiente")).toBeDisabled();
    expect(last.getByLabelText("Mascota anterior")).not.toBeDisabled();
  });
});

describe("PetCredentialCarousel — prefetch exactly one neighbor each side", () => {
  it("prefetches both neighbors in the middle", () => {
    renderCarousel("DIM-PREG-0002");
    expect(prefetch).toHaveBeenCalledWith("/mis-mascotas/DIM-LOST-0001");
    expect(prefetch).toHaveBeenCalledWith("/mis-mascotas/DIM-OKAY-0003");
    expect(prefetch).toHaveBeenCalledTimes(2);
  });

  it("prefetches only the one existing neighbor at an end", () => {
    renderCarousel("DIM-LOST-0001");
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/mis-mascotas/DIM-PREG-0002");
  });
});

describe("PetCredentialCarousel — renders the document", () => {
  it("renders the server document as children below the chrome", () => {
    const { getByTestId } = renderCarousel("DIM-PREG-0002");
    expect(getByTestId("document")).toHaveTextContent("documento");
  });
});
