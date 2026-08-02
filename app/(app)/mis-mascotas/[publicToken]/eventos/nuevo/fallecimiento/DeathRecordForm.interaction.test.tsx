// @vitest-environment jsdom
//
// Rabies-aware disposal warning (surveillance-disposal slice, S1).
//
// Contract under test — bidirectional:
//   - inRabiesObservation && non-recommended method (owner_burial or
//     household_waste) → the STRONG danger callout renders, citing the
//     observation framework (Ley 22.953), and the generic burial tips do NOT
//     (advising HOW to bury while saying DON'T bury would contradict itself).
//   - inRabiesObservation && recommended method (cremation) → no warning.
//   - !inRabiesObservation && owner_burial → only the pre-existing generic
//     tips ("Si vas a enterrarlo…"), never the rabies callout.
//
// Exercises the REAL useState chain via RTL (same pattern as
// CodeEntryForm.interaction.test.tsx) so the select→callout wiring is covered,
// not just a predicate.

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeathRecordForm } from "./DeathRecordForm";

const RABIES_WARNING_TITLE = "Tu mascota está en observación antirrábica";
const GENERIC_TIPS = "Si vas a enterrarlo, te recomendamos:";

afterEach(() => {
  cleanup();
});

function renderForm(inRabiesObservation: boolean) {
  const action = vi.fn(async () => ({ error: null }));
  render(
    <DeathRecordForm action={action} species="dog" inRabiesObservation={inRabiesObservation} />,
  );
  return screen.getByLabelText(/Método de disposición/i);
}

describe("<DeathRecordForm> — rabies-aware disposal warning", () => {
  it("shows the danger callout for owner_burial during observation, with the legal basis, and hides the generic tips", () => {
    const select = renderForm(true);

    fireEvent.change(select, { target: { value: "owner_burial" } });

    expect(screen.getByText(RABIES_WARNING_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/Ley Nacional 22\.953/)).toBeInTheDocument();
    expect(screen.getByText(/canales autorizados/)).toBeInTheDocument();
    expect(screen.queryByText(GENERIC_TIPS)).toBeNull();
  });

  it("shows the danger callout for household_waste during observation", () => {
    const select = renderForm(true);

    fireEvent.change(select, { target: { value: "household_waste" } });

    expect(screen.getByText(RABIES_WARNING_TITLE)).toBeInTheDocument();
  });

  it("does NOT warn for a recommended method during observation", () => {
    const select = renderForm(true);

    fireEvent.change(select, { target: { value: "cremation_collective" } });

    expect(screen.queryByText(RABIES_WARNING_TITLE)).toBeNull();
    expect(screen.queryByText(GENERIC_TIPS)).toBeNull();
  });

  it("keeps only the generic burial tips for owner_burial when NOT under observation", () => {
    const select = renderForm(false);

    fireEvent.change(select, { target: { value: "owner_burial" } });

    expect(screen.getByText(GENERIC_TIPS)).toBeInTheDocument();
    expect(screen.queryByText(RABIES_WARNING_TITLE)).toBeNull();
  });

  it("does not warn on household_waste when NOT under observation (status quo)", () => {
    const select = renderForm(false);

    fireEvent.change(select, { target: { value: "household_waste" } });

    expect(screen.queryByText(RABIES_WARNING_TITLE)).toBeNull();
    expect(screen.queryByText(GENERIC_TIPS)).toBeNull();
  });

  it("never blocks submission — the CTA stays enabled with the warning visible", () => {
    const select = renderForm(true);
    fireEvent.change(select, { target: { value: "owner_burial" } });

    const cta = screen.getByRole("button", { name: "Registrar fallecimiento" });
    expect(cta).toBeEnabled();
  });
});
