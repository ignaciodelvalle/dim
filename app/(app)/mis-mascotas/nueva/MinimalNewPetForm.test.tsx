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
    id: `id-${indecId}`,
    indecId,
    provinceCode: provinceCode as LocalitySearchResult["provinceCode"],
    departmentName: null,
    departmentCode: null,
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

  it("blocks advancing when a locality is TYPED but no suggestion is picked (Cowork B9)", async () => {
    render(<MinimalNewPetForm action={noopAction} />);
    fireEvent.change(screen.getByLabelText(/^nombre/i), { target: { value: "Pampa" } });
    fireEvent.click(screen.getByRole("button", { name: /perro\/a/i }));
    fireEvent.change(screen.getByLabelText(/Provincia/), { target: { value: "AR-C" } });
    // Type a locality but NEVER pick a suggestion → provinceCode stays empty, the
    // same "unresolved" signal the server rejects on. Step 1 must not advance.
    fireEvent.change(screen.getByLabelText(/Localidad o barrio/), { target: { value: "Palermo" } });

    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/localidad/i);
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

// ---------------------------------------------------------------------------
// PO bug 2026-07-18 — stale duplicatePrompt after back-navigation.
//
// Repro (staging, account with existing pets): submit → duplicatePrompt banner
// → Volver → change species → Continuar. The server state never cleared, so the
// STALE banner (old species) kept hiding the normal submit button, leaving
// "No, es otra — crear igual" as the only affirmative action — which submits
// IMMEDIATELY with duplicateOverride=1, skipping the foto/más-datos step and
// bypassing the P2 re-check for an identity the server never evaluated.
//
// Contract pinned here: editing any P2-relevant identity field (name / species
// / sex) marks the prompt STALE — a stale prompt stops rendering and stops
// hiding the submit; the fresh submit re-runs the authoritative server P2
// check; a NEW duplicatePrompt from that submit renders fresh (staleness
// resets); the genuine "no, es otra" path is unchanged.
// ---------------------------------------------------------------------------

const DUP_PAMPA: NewPetFormState = {
  error: null,
  duplicatePrompt: { name: "Pampa", species: "dog", sex: "unknown", publicToken: "DIM-TEST-0001" },
};

/** Action test-double: records every submitted FormData and replies from a
 * script (last entry repeats). Lets tests assert WHAT each submit carried. */
function makeRecordingAction(script: NewPetFormState[]) {
  const calls: Array<Record<string, FormDataEntryValue>> = [];
  const action = async (_prev: NewPetFormState, formData: FormData): Promise<NewPetFormState> => {
    calls.push(Object.fromEntries(formData.entries()));
    return script[Math.min(calls.length - 1, script.length - 1)];
  };
  return { action, calls };
}

/** Drive the PO's sequence up to the stale point: submit → banner → Volver →
 * change species to cat → Continuar (back on paso 2). */
async function reachStalePromptWithChangedSpecies() {
  await completeStep1();
  fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
  fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));
  await screen.findByText(/¿es la misma\?/i);

  fireEvent.click(screen.getByRole("button", { name: /paso anterior/i }));
  fireEvent.click(screen.getByRole("button", { name: /gato\/a/i }));
  fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
}

describe("MinimalNewPetForm — stale duplicatePrompt (PO bug 2026-07-18)", () => {
  it("restores the normal submit path after the species is edited (stale banner stops gating)", async () => {
    const { action, calls } = makeRecordingAction([DUP_PAMPA, { error: null }]);
    render(<MinimalNewPetForm action={action} />);

    await reachStalePromptWithChangedSpecies();

    // The stale banner must be gone and the plain submit must be back.
    expect(screen.queryByText(/¿es la misma\?/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear mascota/i })).toBeInTheDocument();
    // And nothing auto-submitted without user intent.
    expect(calls).toHaveLength(1);
  });

  it("re-runs the server P2 check with the NEW species on the fresh submit (override stays 0)", async () => {
    const { action, calls } = makeRecordingAction([DUP_PAMPA, { error: null }]);
    render(<MinimalNewPetForm action={action} />);

    await reachStalePromptWithChangedSpecies();
    fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].species).toBe("cat");
    expect(calls[1].duplicateOverride).toBe("0");
  });

  it("editing the sex after a prompt also un-gates the submit", async () => {
    const { action, calls } = makeRecordingAction([DUP_PAMPA, { error: null }]);
    render(<MinimalNewPetForm action={action} />);

    await completeStep1();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));
    await screen.findByText(/¿es la misma\?/i);

    fireEvent.click(screen.getByRole("button", { name: /paso anterior/i }));
    fireEvent.click(screen.getByLabelText(/hembra/i));
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.queryByText(/¿es la misma\?/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear mascota/i })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("renders a FRESH duplicatePrompt when the edited resubmit still collides (staleness resets)", async () => {
    const dupMichi: NewPetFormState = {
      error: null,
      duplicatePrompt: {
        name: "Pampa",
        species: "cat",
        sex: "unknown",
        publicToken: "DIM-TEST-0002",
      },
    };
    const { action, calls } = makeRecordingAction([DUP_PAMPA, dupMichi]);
    render(<MinimalNewPetForm action={action} />);

    await reachStalePromptWithChangedSpecies();
    fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));

    await waitFor(() => expect(calls).toHaveLength(2));
    // The fresh prompt (cat) renders and gates again.
    expect(await screen.findByText(/¿es la misma\?/i)).toBeInTheDocument();
    expect(screen.getByText(/gato\/a, sexo sin especificar/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^crear mascota$/i })).not.toBeInTheDocument();
  });

  it("keeps the genuine 'no, es otra — crear igual' path: immediate submit with duplicateOverride=1", async () => {
    const { action, calls } = makeRecordingAction([DUP_PAMPA, { error: null }]);
    render(<MinimalNewPetForm action={action} />);

    await completeStep1();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));
    await screen.findByText(/¿es la misma\?/i);

    fireEvent.click(screen.getByRole("button", { name: /no, es otra/i }));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].duplicateOverride).toBe("1");
  });

  it("keeps the picked locality (resolved provinceCode) across the duplicate-prompt server return", async () => {
    const { action } = makeRecordingAction([DUP_PAMPA]);
    const { container } = render(<MinimalNewPetForm action={action} />);

    await completeStep1();
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /crear mascota/i }));
    await screen.findByText(/¿es la misma\?/i);

    fireEvent.click(screen.getByRole("button", { name: /paso anterior/i }));

    // The LnCombobox visible input still shows the pick; the hidden inputs still
    // carry the RESOLVED wire values the server's LOCALITY_UNRESOLVED guard reads.
    expect(screen.getByLabelText(/Localidad o barrio/)).toHaveValue("Belgrano");
    expect(container.querySelector<HTMLInputElement>('input[name="provinceCode"]')?.value).toBe(
      "AR-C",
    );
    expect(container.querySelector<HTMLInputElement>('input[name="localityName"]')?.value).toBe(
      "Belgrano",
    );
  });
});

describe("MinimalNewPetForm — Enter key on paso 1", () => {
  it("routes Enter on a step-1 text input to the Continuar guard instead of submitting", async () => {
    const { action, calls } = makeRecordingAction([{ error: null }]);
    render(<MinimalNewPetForm action={action} />);

    // Name filled but species missing: Enter must surface the same validation
    // the Continuar button shows — and must NOT submit the form.
    const nameInput = screen.getByLabelText(/^nombre/i);
    fireEvent.change(nameInput, { target: { value: "Pampa" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(screen.getByRole("alert")).toHaveTextContent(/especie/i);
    expect(calls).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /crear mascota/i })).not.toBeInTheDocument();
  });

  it("advances to paso 2 on Enter when paso 1 is complete — never a submit", async () => {
    const { action, calls } = makeRecordingAction([{ error: null }]);
    render(<MinimalNewPetForm action={action} />);

    await completeStep1();
    fireEvent.keyDown(screen.getByLabelText(/^nombre/i), { key: "Enter" });

    // Paso 2 revealed via goToStep2 — the form itself never submitted.
    expect(screen.getByRole("button", { name: /crear mascota/i })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
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
