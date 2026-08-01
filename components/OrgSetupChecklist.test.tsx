// Render tests for <OrgSetupChecklist> — the user-visible half of the B2 fix.
//
// The domain half is pinned in __tests__/org-setup-checklist.test.ts (a
// waitingOn:"mimar" step carries href:null / cta:null and is excluded from
// isSetupComplete). This file pins what that produces ON SCREEN, because the
// defect was a rendered promise: a "Enviar documentación" button pointing at
// /org/{token}/configuracion, a page whose own closing line says the
// verification state "es gestionado por el equipo de miMAR". Nothing to send,
// nothing the org can do, and a button anyway.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrgSetupChecklist } from "@/components/OrgSetupChecklist";
import { type SetupStep, deriveSetupSteps } from "@/lib/infra/org-setup-checklist";

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** A shelter that has done everything it can and is still unverified. */
function unverifiedShelterSteps(): SetupStep[] {
  return deriveSetupSteps({
    orgType: "shelter",
    hasCoverage: false,
    memberCount: 1,
    canCreateServices: false,
    hasServices: false,
    hasCapacityDeclared: false,
    isVerified: false,
  });
}

describe("<OrgSetupChecklist> — the verification row is a status, not a task", () => {
  it("renders the verification row with a status tag and no link of its own", () => {
    const html = render(<OrgSetupChecklist steps={unverifiedShelterSteps()} orgToken="ORG-TEST" />);

    // The row is still present — the fix is honesty, not deletion.
    expect(html).toContain("Verificación");
    expect(html).toContain("En revisión de miMAR");
  });

  it("renders NO anchor at all when the only pending step waits on miMAR", () => {
    // Found by mutation: dropping the `step.href !== null` guard on the CTA
    // still passed every other test in this file, because the resulting
    // element is an EMPTY anchor — `<a href="/org/ORG-TEST/null"></a>`, label
    // `null`, invisible on screen and a 404 for anyone who tabs onto it. No
    // copy assertion can see that; counting anchors can.
    const steps = deriveSetupSteps({
      orgType: "clinic",
      hasCoverage: true,
      memberCount: 2,
      canCreateServices: false,
      hasServices: false,
      hasCapacityDeclared: false,
      isVerified: false,
    });
    expect(steps.filter((s) => !s.done).map((s) => s.key)).toEqual(["verification"]);

    const html = render(<OrgSetupChecklist steps={steps} orgToken="ORG-TEST" />);
    expect(html).toContain("En revisión de miMAR");
    expect(html).not.toContain("<a ");
    // Belt and braces: the literal shape the broken guard produced.
    expect(html).not.toContain("/org/ORG-TEST/null");
  });

  it("never links the checklist to /configuracion for the verification step", () => {
    const steps = unverifiedShelterSteps();
    // Guard the guard: `capacity` also points at configuracion, so asserting
    // "no configuracion link at all" would pass for the wrong reason on a
    // shelter. Drop it and the ONLY remaining candidate is verification.
    const withoutCapacity = steps.filter((s) => s.key !== "capacity");
    expect(withoutCapacity.some((s) => s.key === "verification")).toBe(true);

    const html = render(<OrgSetupChecklist steps={withoutCapacity} orgToken="ORG-TEST" />);

    expect(html).not.toContain('href="/org/ORG-TEST/configuracion"');
    // …and specifically not the string the old CTA rendered. Paired with the
    // positive "En revisión de miMAR" assertion above so this cannot quietly
    // become a tautology: if the tag copy changes, that test fails first.
    expect(html).not.toContain("Enviar documentación");
    // Sanity: a step the org CAN act on still renders its link, so the
    // assertions above are about verification and not about a broken render.
    expect(html).toContain('href="/org/ORG-TEST/cobertura"');
  });

  it("counts progress over org-actionable steps only", () => {
    // shelter, nothing done: coverage + members + capacity are actionable,
    // verification is not. The denominator must be 3, not 4 — an unreachable
    // denominator is the same lie the CTA told, relocated to the counter.
    const html = render(<OrgSetupChecklist steps={unverifiedShelterSteps()} orgToken="ORG-TEST" />);
    expect(html).toContain("0 de 3 pasos completados");
    expect(html).not.toContain("0 de 4 pasos completados");
  });

  it("autofocuses the first ORG-actionable pending step, not the verification row", () => {
    // Only verification is pending here. autoFocus must land nowhere: the
    // waiting row renders a <span>, and focusing a row with no action is a
    // dead end for a keyboard user.
    const steps = deriveSetupSteps({
      orgType: "clinic",
      hasCoverage: true,
      memberCount: 2,
      canCreateServices: false,
      hasServices: false,
      hasCapacityDeclared: false,
      isVerified: false,
    });
    expect(steps.filter((s) => !s.done).map((s) => s.key)).toEqual(["verification"]);

    const html = render(<OrgSetupChecklist steps={steps} orgToken="ORG-TEST" autoFocusFirst />);
    expect(html).toContain("En revisión de miMAR");
    expect(html).not.toContain("autofocus");
    expect(html).not.toContain('aria-current="step"');
  });
});
