// Notification template catalog coverage + render.

import { describe, expect, it } from "vitest";

import {
  CASE_NOTIFICATION_TEMPLATES,
  type CaseNotificationTemplateId,
  renderCaseNotificationTemplate,
} from "@/lib/notification-templates";

const ALL_TEMPLATE_IDS = Object.keys(CASE_NOTIFICATION_TEMPLATES) as CaseNotificationTemplateId[];

describe("CASE_NOTIFICATION_TEMPLATES — invariants", () => {
  it("has at least the V1 lifecycle template families", () => {
    // Spot-check one template per V1 lifecycle (§§5.9-11.9).
    const expectedSamples: CaseNotificationTemplateId[] = [
      "bite_incident_opened_owner",
      "lost_episode_opened_owner",
      "welfare_denuncia_opened_govt",
      "adoption_listing_opened_org",
      "adoption_application_submitted_applicant",
      "custody_dispute_opened_owner",
      "foster_placement_opened_foster",
    ];
    for (const id of expectedSamples) {
      expect(CASE_NOTIFICATION_TEMPLATES[id]).toBeDefined();
    }
  });

  for (const id of ALL_TEMPLATE_IDS) {
    const tpl = CASE_NOTIFICATION_TEMPLATES[id];

    it(`${id}: has non-empty title + body + valid severity`, () => {
      expect(tpl.title.length).toBeGreaterThan(0);
      expect(tpl.body.length).toBeGreaterThan(0);
      expect(["info", "success", "warning", "urgent"]).toContain(tpl.severity);
    });

    it(`${id}: if ctaLabel set, ctaUrlPattern is set too`, () => {
      if (tpl.ctaLabel !== undefined) {
        expect(tpl.ctaUrlPattern).toBeDefined();
      }
    });
  }
});

describe("renderCaseNotificationTemplate — substitution", () => {
  it("substitutes {{placeholders}} from vars", () => {
    const result = renderCaseNotificationTemplate("bite_incident_opened_owner", {
      pet_name: "Toto",
      bite_date: "2026-05-19",
      public_code: "CAS-AB12-CD34",
    });
    expect(result.title).toContain("Toto");
    expect(result.body).toContain("2026-05-19");
    expect(result.ctaUrl).toBe("/casos/CAS-AB12-CD34");
    expect(result.ctaLabel).toBe("Ver caso");
  });

  it("leaves unknown placeholders verbatim (so missing data is visible)", () => {
    const result = renderCaseNotificationTemplate("bite_incident_opened_owner", {
      pet_name: "Toto",
    });
    expect(result.body).toContain("{{bite_date}}");
  });

  it("returns null cta fields when template has no CTA", () => {
    const result = renderCaseNotificationTemplate("lost_episode_resolved_broadcast", {
      pet_name: "Toto",
    });
    expect(result.ctaLabel).toBeNull();
    expect(result.ctaUrl).toBeNull();
  });
});
