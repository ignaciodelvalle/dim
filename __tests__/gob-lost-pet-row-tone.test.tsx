// pet-state-header R7.1 — listing tone alignment audit (gob side).
//
// A LOST pet's status pill on /gob/perdidas must use the same tone family as
// the perdida situation everywhere else (alerta → err/red). It was mapped to
// `open` (st-warn, AMBER — "needs action" case semantics), so the same pet
// read amber on the gob row and red on its credential band / owner row.
//
// Render via react-dom/server (repo convention), next/link mocked.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("a", { href, className }, children),
}));

import { LostPetRow } from "@/app/gob/perdidas/_components/LostPetRow";

function renderRow(petStatus: string): string {
  return renderToStaticMarkup(
    <LostPetRow
      pet={{
        petId: "pet-1",
        petPublicToken: "DIM-GOBT-0001",
        petName: "Firulais",
        species: "dog",
        petStatus,
        province: "Buenos Aires",
        locality: "La Plata",
        markedLostAt: new Date("2026-07-01T12:00:00Z"),
        lastSeenLat: null,
        lastSeenLng: null,
        ownerDisplayName: null,
      }}
    />,
  );
}

describe("gob LostPetRow — situation tone alignment (R7.1)", () => {
  it("LOST pill uses the err (alerta) family — never the amber case-workflow tone", () => {
    const html = renderRow("lost");
    expect(html).toContain("Perdida");
    expect(html).toContain("st-err");
    expect(html).not.toContain("st-warn");
  });

  it("active pill keeps the ok family", () => {
    const html = renderRow("active");
    expect(html).toContain("st-ok");
  });
});
