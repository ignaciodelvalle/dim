// Unit tests for startWelfareReport use-case.
// Spec R3 — start transitions + audit_log + triage-actor backfill + reporter notification.

import { describe, expect, it, vi } from "vitest";

import type { WelfareReport } from "@/db/schema";
import type { WelfareRepository } from "../../infrastructure/welfare-repository";
import { startWelfareReport } from "../start-welfare-report";

function makeReport(overrides: Partial<WelfareReport> = {}): WelfareReport {
  return {
    id: "rpt-001",
    referenceCode: "DEN-TEST-001",
    status: "open",
    reporterUserId: "user-reporter-01",
    caseId: "case-001",
    triagedAt: null,
    triagedByUserId: null,
    closedAt: null,
    resolutionNotes: null,
    moderationResolvedAt: null,
    moderationResolvedByUserId: null,
    flaggedAt: null,
    flagReasons: [],
    assignedToUserId: null,
    subjectPetId: null,
    kind: "neglect",
    severity: "medium",
    subjectKind: "unowned_animal",
    subjectDescription: "Un perro callejero",
    description: "El animal parece estar desnutrido y sin agua.",
    observedSymptoms: null,
    occurredAt: null,
    locationAddress: null,
    locationLat: null,
    locationLng: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "CABA",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as WelfareReport;
}

function makeDeps(reportOverride?: Partial<WelfareReport>) {
  const report = makeReport(reportOverride);
  const repo = {
    findById: vi.fn().mockResolvedValue(report),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    insertAudit: vi.fn().mockResolvedValue(undefined),
  } as unknown as WelfareRepository;
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<void>) => {
    await cb({});
  });
  const actor = { user: { id: "admin-user-01" }, profile: { role: "admin" as const } };
  return { repo, transaction, actor, report };
}

describe("startWelfareReport — valid transitions", () => {
  it("open → in_progress: updates status + audit_log + reporter notification", async () => {
    const { repo, transaction, actor } = makeDeps();

    const result = await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Iniciando seguimiento del caso." },
      { repo, transaction, actor },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(repo.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "welfare_report_started" }),
      expect.anything(),
    );
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].notificationType).toBe("welfare_report_status_changed");
  });

  it("triaged → in_progress: allowed", async () => {
    const { repo, transaction, actor } = makeDeps({ status: "triaged" });

    const result = await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Continuando con el seguimiento." },
      { repo, transaction, actor },
    );

    expect(result.ok).toBe(true);
  });

  it("open → in_progress backfills triagedAt when null (triage-skipped)", async () => {
    const { repo, transaction, actor } = makeDeps({ status: "open", triagedAt: null });

    await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Iniciando sin triage previo." },
      { repo, transaction, actor },
    );

    const updateCall = (repo.updateStatus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[1]).toEqual(
      expect.objectContaining({ triagedAt: expect.any(Date), triagedByUserId: "admin-user-01" }),
    );
  });

  it("does NOT backfill triagedAt when already set", async () => {
    const existingDate = new Date("2026-01-10");
    const { repo, transaction, actor } = makeDeps({
      status: "triaged",
      triagedAt: existingDate,
      triagedByUserId: "other-admin",
    });

    await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Triage ya hecho, iniciando." },
      { repo, transaction, actor },
    );

    const updateCall = (repo.updateStatus as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updateCall[1]).not.toHaveProperty("triagedAt");
    expect(updateCall[1]).not.toHaveProperty("triagedByUserId");
  });
});

describe("startWelfareReport — guard failures", () => {
  it("notes too short → error, no repo call", async () => {
    const { repo, transaction, actor } = makeDeps();
    const result = await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Corto" },
      { repo, transaction, actor },
    );
    expect(result.ok).toBe(false);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("in_progress → in_progress is illegal", async () => {
    const { repo, transaction, actor } = makeDeps({ status: "in_progress" });
    const result = await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Intentando re-iniciar denuncia." },
      { repo, transaction, actor },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/in_progress/);
  });

  it("closed → in_progress is illegal (terminal)", async () => {
    const { repo, transaction, actor } = makeDeps({ status: "closed" });
    const result = await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Intentando reabrir caso cerrado." },
      { repo, transaction, actor },
    );
    expect(result.ok).toBe(false);
  });

  it("anon reporter → no notification", async () => {
    const { repo, transaction, actor } = makeDeps({ reporterUserId: null });
    const result = await startWelfareReport(
      { welfareReportId: "rpt-001", notes: "Caso anónimo iniciado ahora." },
      { repo, transaction, actor },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(0);
  });
});
