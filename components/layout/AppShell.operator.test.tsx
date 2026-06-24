// PR-1 V1 — the operator shell keeps the demo banner INSIDE the 100vh column so
// the document never exceeds the viewport (no external scroll, no clipped rail
// footer). Pattern: renderToStaticMarkup (AppShell is a server component).

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("AppShell variant=operator — banner inside the 100vh shell (PR-1 V1)", () => {
  it("renders the banner inside an h-screen flex-col column, above the rail", () => {
    const html = render(
      <AppShell
        variant="operator"
        banner={<div data-testid="demo-banner">Datos de demostración</div>}
        rail={<div data-testid="rail">rail</div>}
        topbar={<div data-testid="topbar">topbar</div>}
      >
        <div data-testid="page-body">contenido</div>
      </AppShell>,
    );
    expect(html).toContain("demo-banner");
    expect(html).toContain('data-testid="rail"');
    expect(html).toContain("page-body");
    // The shell is a single 100vh column: banner stacks above the rail+main row.
    expect(html).toContain("h-screen");
    expect(html).toContain("flex-col");
    // Banner precedes the rail in document order (it is the top of the column).
    expect(html.indexOf("demo-banner")).toBeLessThan(html.indexOf('data-testid="rail"'));
    // Exactly one main landmark (no duplicate <main>).
    expect((html.match(/id="main-content"/g) ?? []).length).toBe(1);
  });

  it("omits the banner when none is passed (e.g. /gob) and stays a 100vh shell", () => {
    const html = render(
      <AppShell variant="operator" rail={<div data-testid="rail">rail</div>} topbar={<div>tb</div>}>
        <div>x</div>
      </AppShell>,
    );
    expect(html).not.toContain("demo-banner");
    expect(html).toContain("h-screen");
    expect((html.match(/id="main-content"/g) ?? []).length).toBe(1);
  });
});
