// Regression guard for the admin cockpit deep-link changes (fd2bbb1e:
// "fix(admin): deep-link cockpit tiles, drop duplicate cola KPI, fix clickable
// site map").
//
// Covers two things that previously drifted without a test:
//   1. QueueHealthCockpit's approval tiles deep-link to /admin/cola?type=<exact
//      type> for the three approval types, and the SLA tile deep-links to
//      /admin/outbox?breach=yes (breached rows only, not the full outbox).
//   2. AdminKpiStrip's `omitPendingQueue` flag: the admin home (cockpit above
//      already owns the per-type pending count) must NOT also render "Cola
//      pendiente", while /admin/sistema (no cockpit) keeps it.
//
// Pattern: renderToStaticMarkup (repo convention — no jsdom). Both components
// are presentational server components; OpKpi's InfoButton uses useState,
// which renders fine with an initial value under renderToStaticMarkup (see
// __tests__/a11y-badge-kpi.test.tsx for the same pattern against OpKpi).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdminKpiStrip, type AdminKpiStripData } from "@/components/admin/AdminKpiStrip";
import { QueueHealthCockpit } from "@/components/admin/QueueHealthCockpit";
import type { QueueCockpit } from "@/lib/analytics/admin-metrics";

const cockpit: QueueCockpit = {
  approvals: {
    pendingTotal: 6,
    oldestPendingDaysAgo: 3,
    roleUpgradeVet: 2,
    organizationVerification: 3,
    serviceDogCredentialVerification: 1,
  },
  moderationPending: 4,
  alertsOpen: 2,
  outboxBreaches: 5,
  casesOpen: 7,
  rabiesInProgress: 1,
};

describe("QueueHealthCockpit — approval tiles deep-link to their own filtered queue", () => {
  const html = renderToStaticMarkup(<QueueHealthCockpit cockpit={cockpit} />);

  it("Matrículas veterinarias tile links to /admin/cola?type=role_upgrade_vet", () => {
    expect(html).toContain('href="/admin/cola?type=role_upgrade_vet"');
  });

  it("Verificación de organizaciones tile links to /admin/cola?type=organization_verification", () => {
    expect(html).toContain('href="/admin/cola?type=organization_verification"');
  });

  it("Credenciales RUPGA tile links to /admin/cola?type=service_dog_credential_verification", () => {
    expect(html).toContain('href="/admin/cola?type=service_dog_credential_verification"');
  });

  it("SLA (outbox) tile links to /admin/outbox?breach=yes, not the bare outbox", () => {
    expect(html).toContain('href="/admin/outbox?breach=yes"');
    expect(html).not.toContain('href="/admin/outbox"');
  });
});

describe("AdminKpiStrip — omitPendingQueue prevents the duplicate 'Cola pendiente' tile", () => {
  const baseData: AdminKpiStripData = {
    totalPersonal: 120,
    totalInstitutionalActive: 8,
    pendingTotal: 6,
    oldestPendingDaysAgo: 3,
    decisionsTotal7d: 10,
    approved7d: 7,
    rejected7d: 3,
    decisionsDelta: null,
  };

  it("renders 'Cola pendiente' when omitPendingQueue is NOT set (e.g. /admin/sistema)", () => {
    const html = renderToStaticMarkup(<AdminKpiStrip data={baseData} />);
    expect(html).toContain("Cola pendiente");
  });

  it("does NOT render 'Cola pendiente' when omitPendingQueue is set (the admin home)", () => {
    const html = renderToStaticMarkup(<AdminKpiStrip data={baseData} omitPendingQueue />);
    expect(html).not.toContain("Cola pendiente");
    // The promoted non-duplicated metric takes its place.
    expect(html).toContain("Instituciones activas");
  });
});
