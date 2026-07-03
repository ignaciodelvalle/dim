// Smoke tests for <LnStatusFlag>.
// Pattern: renderToStaticMarkup (server-only, no React DOM needed).
//
// The "registered" variant exists so the header chip can stop claiming
// AL DÍA for pets whose compliance panel says otherwise (QA 2026-07-03).
// AL DÍA is reserved for full compliance — see LnPetStatus in Chip.tsx.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LnStatusFlag } from "./StatusFlag";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("<LnStatusFlag>", () => {
  it("renders AL DÍA only for the ok (fully compliant) status", () => {
    expect(render(<LnStatusFlag status="ok" />)).toContain("AL DÍA");
    expect(render(<LnStatusFlag status="registered" />)).not.toContain("AL DÍA");
  });

  it("renders the neutral REGISTRADA label for the registered status", () => {
    const html = render(<LnStatusFlag status="registered" />);
    expect(html).toContain("REGISTRADA");
    expect(html).not.toContain("ln-ok");
  });

  it("keeps the existing state labels", () => {
    expect(render(<LnStatusFlag status="sick" />)).toContain("EN TRATAMIENTO");
    expect(render(<LnStatusFlag status="lost" />)).toContain("PERDIDO");
    expect(render(<LnStatusFlag status="pregnant" />)).toContain("PREÑADA");
  });
});
