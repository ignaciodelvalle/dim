// @vitest-environment jsdom
//
// MinimalNewPetForm — owner pet alta 2-step wizard (PO decision 2026-07-08).
// These tests pin the redesign's UX contract:
//   1. paso 1 (identidad) gates advancing on nombre + especie + localidad;
//   2. the PPP notice reacts LIVE to the breed selection in paso 1 (appears for
//      a canonical PPP dog breed, disappears when the breed changes);
//   3. paso 2 (foto y más) is only revealed after paso 1 is completed, and it
//      surfaces the prominent photo field + the final "Crear mascota" submit.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalitySearchResult } from "@/lib/infra/ar-localidades";
import type { NewPetFormState } from "@/src/modules/pets/domain/types";

const searchMock = vi.fn();

// LocationFields transitively imports these "use server" modules (which pull in
// @/db, unavailable in unit tests). Mock them exactly as LocationFields.cascade
// does so the module graph stays client-only.
vi.mock("@/app/actions/localities", () => ({
  searchLocalitiesAction: (input: { provinceCode?: string; query: string }) => searchMock(input),
  searchLocalitiesPublicAction: (input: { provinceCode?: string; query: string }) =>
    searchMock(input),
}));

vi.mock("@/app/actions/geocoding", () => ({
  geocodeAddressAction: vi.fn(),
  geocodeAddressPublicAction: vi.fn(),
  reverseGeocodeAction: vi.fn(),
  reverseGeocodePublicAction: vi.fn(),
}));

import { MinimalNewPetForm } from "./MinimalNewPetForm";

// A no-op form action; these tests never exercise a real server submit.
const noopAction = async (): Promise<NewPetFormState> => ({ error: null });

function makeResult(
  localityName: string,
  provinceCode: string,
  provinceName: string,
  indecId: string,
): LocalitySearchResult {
  return {
    indecId,
    provinceCode: provinceCode as LocalitySearchResult["provinceCode"],
    departmentName: null,
    localityName,
    localitySlug: localityName.toLowerCase().replace(/\s+/g, "-"),
    category: "localidad",
    provinceName,
    matchKind: "exact",
  };
}

/** Fill nombre + especie(dog) + a resolved localidad so paso 1 can advance. */
async function completeStep1() {
  fireEvent.change(screen.getByLabelText(/^nombre/i), { target: { value: "Pampa" } });
  fireEvent.click(screen.getByRole("button", { name: /perro\/a/i }));

  fireEvent.change(screen.getByLabelText(/Provincia/), { target: { value: "AR-C" } });
  fireEvent.change(screen.getByLabelText(/Localidad o barrio/), { target: { value: "Bel" } });
  fireEvent.mouseDown(await screen.findByText("Belgrano"));
}

beforeEach(() => {
  searchMock.mockReset();
  searchMock.mockResolvedValue({ results: [makeResult("Belgrano", "AR-C", "CABA", "02000020")] });
});

afterEach(() => {
  cleanup();
});

describe("MinimalNewPetForm — paso 1 gating", () => {
  it("starts on paso 1 (Continuar visible, no final submit yet)", () => {
    render(<MinimalNewPetForm action={noopAction} />);
    expect(screen.getByRole("button", { name: /continuar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /crear mascota/i })).not.toBeInTheDocument();
  });

  it("blocks advancing while required fields are missing", () => {
    render(<MinimalNewPetForm action={noopAction} />);
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/nombre/i);
    // Still on paso 1 — the final submit never appeared.
    expect(screen.queryByRole("button", { name: /crear mascota/i })).not.toBeInTheDocument();
  });

  it("advances to paso 2 once nombre + especie + localidad are set", async () => {
    render(<MinimalNewPetForm action={noopAction} />);
    await completeStep1();

    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    // Paso 2 revealed: prominent photo field + final submit.
    expect(screen.getByText(/tomar o elegir una foto/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /crear mascota/i })).toBeInTheDocument();
  });
});

describe("MinimalNewPetForm — PPP notice (paso 1, live)", () => {
  it("shows the PPP notice the moment a canonical PPP dog breed is picked", () => {
    render(<MinimalNewPetForm action={noopAction} />);
    fireEvent.click(screen.getByRole("button", { name: /perro\/a/i }));

    expect(screen.queryByText(/razas potencialmente peligrosas/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^raza/i), { target: { value: "Rottweiler" } });
    expect(screen.getByText(/razas potencialmente peligrosas/i)).toBeInTheDocument();
  });

  it("hides the PPP notice again when the breed changes to a non-PPP one", () => {
    render(<MinimalNewPetForm action={noopAction} />);
    fireEvent.click(screen.getByRole("button", { name: /perro\/a/i }));

    const breed = screen.getByLabelText(/^raza/i);
    fireEvent.change(breed, { target: { value: "Rottweiler" } });
    expect(screen.getByText(/razas potencialmente peligrosas/i)).toBeInTheDocument();

    fireEvent.change(breed, { target: { value: "Caniche" } });
    expect(screen.queryByText(/razas potencialmente peligrosas/i)).not.toBeInTheDocument();
  });

  it("does not show the PPP notice for a cat, even with a matching name", () => {
    render(<MinimalNewPetForm action={noopAction} />);
    fireEvent.click(screen.getByRole("button", { name: /gato\/a/i }));

    fireEvent.change(screen.getByLabelText(/^raza/i), { target: { value: "Rottweiler" } });
    expect(screen.queryByText(/razas potencialmente peligrosas/i)).not.toBeInTheDocument();
  });
});

describe("MinimalNewPetForm — data-quality gates", () => {
  it("posts a stable clientIdempotencyKey hidden field (gate P1)", () => {
    const { container } = render(<MinimalNewPetForm action={noopAction} />);
    const key = container.querySelector<HTMLInputElement>('input[name="clientIdempotencyKey"]');
    expect(key).not.toBeNull();
    // UUID v4 shape — generated once on mount by useIdempotencyKey.
    expect(key?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // duplicateOverride starts OFF — the first submit runs the P2 check.
    const override = container.querySelector<HTMLInputElement>('input[name="duplicateOverride"]');
    expect(override?.value).toBe("0");
  });

  it("renders the soft same-owner dedupe confirm when the action returns a duplicatePrompt (gate P2)", async () => {
    const dupAction = async (): Promise<NewPetFormState> => ({
      error: null,
      duplicatePrompt: {
        name: "Pampa",
        species: "dog",
        sex: "male",
        publicToken: "DIM-TEST-0001",
      },
    });
    render(<MinimalNewPetForm action={dupAction} />);
    await completeStep1();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));

    // Inline confirm surfaces with the existing pet + a link to open it.
    expect(await screen.findByText(/¿es la misma\?/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver a pampa/i })).toHaveAttribute(
      "href",
      "/mis-mascotas/DIM-TEST-0001",
    );
    // The plain "Crear mascota" submit is replaced by the two-choice prompt.
    expect(screen.queryByRole("button", { name: /^crear mascota$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no, es otra/i })).toBeInTheDocument();
  });
});

describe("MinimalNewPetForm — photo field", () => {
  it("offers camera OR gallery (no forced-camera capture attribute)", async () => {
    const { container } = render(<MinimalNewPetForm action={noopAction} />);
    await completeStep1();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    const photo = container.querySelector<HTMLInputElement>('input[name="photo"]');
    expect(photo).not.toBeNull();
    expect(photo).toHaveAttribute("accept", "image/*");
    expect(photo).not.toHaveAttribute("capture");
  });
});
