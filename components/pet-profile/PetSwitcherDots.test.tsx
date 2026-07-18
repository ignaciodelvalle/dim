// @vitest-environment jsdom
//
// PetSwitcherDots — app-level navigation between the owner's live pets,
// mounted ABOVE the credential card (PO correction 2026-07-18, reversing the
// tarjeta-todo dots-in-band placement — formerly CarouselBandDots). Pure
// design on the page: no "Mostrando N de M" text — the group's aria-label
// carries the honest-cap disclosure (D2) for screen readers. A dot tap is a
// real navigation to that pet's route.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CarouselPet } from "@/lib/domain/owner-carousel";
import { PetSwitcherDots } from "./PetSwitcherDots";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const PETS: CarouselPet[] = [
  { token: "DIM-LOST-0001", status: "lost" },
  { token: "DIM-PREG-0002", status: "pregnant" },
  { token: "DIM-OKAY-0003", status: "ok" },
];

function renderDots(currentToken: string, liveTotal?: number) {
  return render(<PetSwitcherDots pets={PETS} currentToken={currentToken} liveTotal={liveTotal} />);
}

function dots(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
}

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("PetSwitcherDots — dots", () => {
  it("renders one dot per pet, in the ranked order given, tinted by status", () => {
    const { container } = renderDots("DIM-PREG-0002");
    const rendered = dots(container);
    expect(rendered).toHaveLength(PETS.length);
    // Tint follows status IN ORDER: lost (err) → pregnant (rosa) → ok (ok).
    expect(rendered[0].innerHTML).toContain("bg-[var(--color-ln-err)]");
    expect(rendered[1].innerHTML).toContain("bg-[var(--color-ln-rosa)]");
    expect(rendered[2].innerHTML).toContain("bg-[var(--color-ln-ok)]");
  });

  it("emphasizes exactly the current pet's dot (aria-current) with a per-dot name", () => {
    const { container } = renderDots("DIM-PREG-0002");
    const current = dots(container).filter((d) => d.getAttribute("aria-current") === "true");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("aria-label", "Mascota 2 de 3 (actual)");
  });

  it("gives the current dot a visible active state (ring), not color alone", () => {
    const { container } = renderDots("DIM-PREG-0002");
    const current = dots(container).find((d) => d.getAttribute("aria-current") === "true");
    expect(current?.className).toContain("ring-2");
    expect(current?.className).toContain("ring-[var(--color-ln-azul)]");
  });

  it("tapping a dot navigates to that pet's real route; the current dot is a no-op", () => {
    const { container } = renderDots("DIM-PREG-0002");
    fireEvent.click(dots(container)[2]);
    expect(push).toHaveBeenCalledWith("/mis-mascotas/DIM-OKAY-0003");
    push.mockClear();
    fireEvent.click(dots(container)[1]);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("PetSwitcherDots — honest-cap disclosure lives in the aria-label (D2)", () => {
  it("discloses 'mostrando N de M' when the household exceeds the dots", () => {
    const { getByLabelText } = renderDots("DIM-PREG-0002", 14);
    expect(getByLabelText("Tus mascotas: mostrando 3 de 14")).toBeInTheDocument();
  });

  it("uses the plain group name when the dots cover the whole household", () => {
    const { getByLabelText } = renderDots("DIM-PREG-0002", 3);
    expect(getByLabelText("Tus mascotas")).toBeInTheDocument();
  });

  it("never renders the disclosure as visible text (pure design)", () => {
    const { queryByText } = renderDots("DIM-PREG-0002", 14);
    expect(queryByText(/Mostrando|mostrando/)).toBeNull();
  });
});

describe("PetSwitcherDots — app-chrome placement, not credential content", () => {
  it("renders as its own <nav>, styled by the dedicated above-card class", () => {
    const { container } = renderDots("DIM-PREG-0002");
    const nav = container.querySelector("nav");
    expect(nav).toHaveClass("ln-pet-switcher");
  });

  it("is not marked as a swipe zone — it is a plain tap-nav strip outside the card's gesture wrapper", () => {
    const { container } = renderDots("DIM-PREG-0002");
    expect(container.querySelector("nav")).not.toHaveAttribute("data-swipe-zone");
  });
});
