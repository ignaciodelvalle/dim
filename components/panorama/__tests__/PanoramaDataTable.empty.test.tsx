// @vitest-environment jsdom
//
// C4 (epistemic states) — the ranking's EMPTY state on the flagship
// epidemiological surface.
//
// Zero ranked rows means two OPPOSITE things, and the old copy collapsed both
// into "Sin jurisdicciones bajo meta en este alcance" — an all-clear printed
// while the system had measured nothing. "Sin señales ≠ sin enfermedad" is the
// whole point of the nature axis, and this is the surface where getting it
// wrong tells a ministry the country is fine.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PanoramaDataTable } from "@/components/panorama/PanoramaDataTable";

afterEach(cleanup);

describe("PanoramaDataTable — empty state tells the epistemic truth", () => {
  it("claims the all-clear ONLY when units were actually measured", () => {
    render(
      <PanoramaDataTable
        rows={[]}
        kind="rate"
        measureLabel="cobertura antirrábica"
        measuredUnits={24}
      />,
    );
    expect(screen.getByText(/Ninguna jurisdicción quedó bajo meta/)).toBeTruthy();
    // The claim must carry its own evidence — how many were measured.
    expect(screen.getByText(/Se midieron 24/)).toBeTruthy();
  });

  it("says it is BLIND when nothing could be measured", () => {
    render(
      <PanoramaDataTable
        rows={[]}
        kind="rate"
        measureLabel="cobertura antirrábica"
        measuredUnits={0}
      />,
    );
    // The exact regression: this must NOT read as good news.
    expect(screen.queryByText(/Ninguna jurisdicción quedó bajo meta/)).toBeNull();
    expect(screen.getByText(/Sin señales en este alcance/)).toBeTruthy();
    expect(screen.getByText(/Sin señales no es lo mismo que sin problema/)).toBeTruthy();
  });

  it("treats a failed calculation as blindness, not as a result", () => {
    render(
      <PanoramaDataTable
        rows={[]}
        kind="rate"
        measureLabel="cobertura antirrábica"
        measuredUnits={24}
        dataUnavailable
      />,
    );
    expect(screen.getByText(/No pudimos calcular el ranking/)).toBeTruthy();
    expect(screen.getByText(/No es un resultado/)).toBeTruthy();
  });

  it("never claims an all-clear for a density metric — it has no target", () => {
    render(
      <PanoramaDataTable rows={[]} kind="density" measureLabel="mordeduras" measuredUnits={24} />,
    );
    expect(screen.getByText(/Sin señales en este alcance/)).toBeTruthy();
  });

  it("defaults to blindness when the caller passes no measured count", () => {
    // A caller that has not been taught to report its measurable universe must
    // not get the all-clear for free.
    render(<PanoramaDataTable rows={[]} kind="rate" measureLabel="cobertura antirrábica" />);
    expect(screen.getByText(/Sin señales en este alcance/)).toBeTruthy();
  });
});
