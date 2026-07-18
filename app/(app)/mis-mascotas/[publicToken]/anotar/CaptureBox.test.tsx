/**
 * Structure test — voice dictation roadmap placeholder in CaptureBox.
 *
 * PO-approved pattern (visible, disabled, reads as "coming", never as
 * broken — precedent: "Informe de situación (en desarrollo)" in panorama's
 * SituationalMap). Pinned here so a future edit to CaptureBox's text-entry
 * surface can't silently drop the roadmap signal, and so the mic affordance
 * never regresses into something that submits the form or steals focus.
 *
 * Pattern: react-dom/server renderToStaticMarkup (repo convention — no
 * jsdom, see anotar/page.test.tsx).
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/mis-mascotas/abc123/anotar",
}));

import { CaptureBox } from "./CaptureBox";

const MIC_LABEL = "Dictado por voz (próximamente)";

describe("<CaptureBox> — voice dictation roadmap placeholder", () => {
  it("renders a disabled mic affordance with the exact accessible name and tooltip", () => {
    const html = renderToStaticMarkup(<CaptureBox petPublicToken="abc123" petName="Firulais" />);
    expect(html).toContain(`aria-label="${MIC_LABEL}"`);
    expect(html).toContain(`title="${MIC_LABEL}"`);
    expect(html).toContain('aria-disabled="true"');
  });

  it('the mic button carries a disabled attribute and type="button" — never a submit control', () => {
    const html = renderToStaticMarkup(<CaptureBox petPublicToken="abc123" petName="Firulais" />);
    const micMatch = html.match(/<button\b[\s\S]*?aria-label="Dictado por voz[\s\S]*?<\/button>/);
    expect(micMatch).not.toBeNull();
    expect(micMatch?.[0]).toContain('type="button"');
    expect(micMatch?.[0]).toContain("disabled=");
  });

  it("the capture textarea and submit button still render alongside the mic placeholder (no interference)", () => {
    const html = renderToStaticMarkup(<CaptureBox petPublicToken="abc123" petName="Firulais" />);
    expect(html).toContain("capture-text");
    expect(html).toContain("Identificar");
  });
});
