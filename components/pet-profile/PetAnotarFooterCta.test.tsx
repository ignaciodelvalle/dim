// Tests for <PetAnotarFooterCta> — pet-document-redesign D3/D5.
//
// Covers: opens `?sheet=anotar` (not `/anotar` page nav), and the org-viewer
// guard (REQ-4.4 — org never gets an Anotar entry point, this component
// included).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PetAnotarFooterCta } from "./PetAnotarFooterCta";

describe("<PetAnotarFooterCta> — opens the anotar sheet, not the page", () => {
  it("owner + active pet: renders a link to ?sheet=anotar", () => {
    const html = renderToStaticMarkup(
      <PetAnotarFooterCta petPublicToken="abc123" petStatus="active" isOwner={true} />,
    );
    expect(html).toContain("/mis-mascotas/abc123?sheet=anotar");
    expect(html).not.toContain("/mis-mascotas/abc123/anotar");
  });
});

describe("<PetAnotarFooterCta> — visibility rules unchanged", () => {
  it("owner + lost pet: renders nothing (Anotar hidden while lost, unchanged rule)", () => {
    const html = renderToStaticMarkup(
      <PetAnotarFooterCta petPublicToken="abc123" petStatus="lost" isOwner={true} />,
    );
    expect(html).toBe("");
  });

  it("owner + deceased pet: renders nothing", () => {
    const html = renderToStaticMarkup(
      <PetAnotarFooterCta petPublicToken="abc123" petStatus="deceased" isOwner={true} />,
    );
    expect(html).toBe("");
  });
});

describe("<PetAnotarFooterCta> — org viewer guard (REQ-4.4)", () => {
  it("org viewer + active pet: renders nothing — no Anotar entry point for org", () => {
    const html = renderToStaticMarkup(
      <PetAnotarFooterCta petPublicToken="abc123" petStatus="active" isOwner={false} />,
    );
    expect(html).toBe("");
  });
});
