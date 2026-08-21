// Parity tests for the events thin controllers — P4
// plausibility layer (2026-07-08).
//
// Module-level unit tests — mock every static import events/actions.ts pulls
// in so we can verify action-edge orchestration without a DB. Mirrors
// src/modules/pets/__tests__/actions-parity.test.ts's approach.
//
// Scope (this file only — the exhaustive edge-case matrix for the pure
// helper lives in lib/events/plausibility.test.ts):
//   - item 2: createWeightAction rejects kg > MAX_WEIGHT_KG before calling
//     the use-case or uploading an attachment.
//   - item 1: createWeightAction / createVaccinationAction reject a future
//     occurredAt and a pre-birth occurredAt (representative call sites —
//     the helper itself is exhaustively covered elsewhere; this just proves
//     the wiring at the action edge).
//   - item 4: createVaccinationAction / createDewormingAction return a
//     sameDayPrompt (no insert, no upload) when a same-calendar-day event of
//     the same type already exists and sameDayOverride is not set; the
//     override flag skips the check and proceeds to the use-case.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayIsoInAr } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Module mocks (must be at top level before imports)
// ---------------------------------------------------------------------------

const BASE_PET = {
  id: "pet-1",
  name: "Firulais",
  species: "dog",
  dateOfBirth: "2020-01-01",
  status: "active",
  rabiesObservationStatus: null,
  jurisdictionProvince: "Buenos Aires",
  jurisdictionLocality: "La Plata",
  discloseFirstNameWhenLost: false,
  disclosePhoneWhenLost: false,
  discloseEmailWhenLost: false,
  discloseLastLocationWhenLost: false,
  allowFinderFormWhenLost: false,
};

const mockRequireAlivePetAccess = vi.hoisted(() => vi.fn());
const mockRequirePetAccess = vi.hoisted(() => vi.fn());
vi.mock("@/lib/infra/pet-access", () => ({
  requireAlivePetAccess: mockRequireAlivePetAccess,
  requirePetAccess: mockRequirePetAccess,
}));

vi.mock("@/lib/infra/auth-guards", () => ({
  requireUserOrRedirect: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/infra/request-cache", () => ({
  getProfileCached: vi.fn().mockResolvedValue({ deletedAt: null }),
}));

const mockUploadAttachmentIfPresent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null }),
);
vi.mock("@/lib/infra/uploads", () => ({
  uploadAttachmentIfPresent: mockUploadAttachmentIfPresent,
}));

vi.mock("@/lib/reference/diseases", () => ({
  findDisease: vi.fn().mockReturnValue({ code: "rabies", label: "Rabia" }),
  isReportable: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/reference/drugs", () => ({
  findDrugByLabel: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/reference/medication-schedule", () => ({
  FREQUENCY_LABELS: {},
  generateDoseSchedule: vi.fn().mockReturnValue([]),
  intervalHoursForFrequency: vi.fn().mockReturnValue(24),
  parseFrequencyFields: vi.fn().mockReturnValue({
    error: null,
    frequency: "daily",
    customHours: null,
    durationDays: null,
    firstDoseAt: new Date("2026-01-01T00:00:00Z"),
  }),
}));

vi.mock("@/lib/domain/location-normalize", () => ({
  CoordError: class CoordError extends Error {},
  normalizeLocationForWrite: vi.fn().mockResolvedValue({
    province: "Buenos Aires",
    locality: "La Plata",
    lat: null,
    lng: null,
  }),
}));

vi.mock("@/lib/domain/location-value", () => ({
  parseLocationFromFormData: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  }),
}));

vi.mock("@/src/modules/surveillance/application/enqueue-eno-trigger", () => ({
  enqueueEnoTrigger: vi.fn().mockResolvedValue(undefined),
}));

// createDeathRecordAction dynamically imports these before its writer runs.
vi.mock("@/lib/infra/case-helpers", () => ({
  findOpenCaseForPetAndKind: vi.fn().mockResolvedValue(null),
  openCase: vi.fn(),
}));

// createSymptomObservedAction revalidates its pet page on success.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/src/modules/surveillance/infrastructure/surveillance-repository", () => ({
  SurveillanceRepository: class SurveillanceRepository {},
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
  },
  profiles: {},
  pets: {},
  notifications: { $inferInsert: {} },
}));

const mockFindSameDayEventOfType = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockRepoInsertEventIdempotent = vi.hoisted(() => vi.fn());
vi.mock("../infrastructure/events-repository", () => {
  class FakeEventsRepository {
    findSameDayEventOfType = mockFindSameDayEventOfType;
    insertEventIdempotent = mockRepoInsertEventIdempotent;
    insertAttachment = vi.fn();
    completeReminder = vi.fn();
    insertReminders = vi.fn();
    findOpenReminders = vi.fn().mockResolvedValue([]);
    updateWeightProjection = vi.fn();
  }
  return { EventsRepository: FakeEventsRepository };
});

const mockCreateVaccination = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-1" }, notifications: [] }),
);
vi.mock("../application/medical/vaccination-use-case", () => ({
  createVaccination: mockCreateVaccination,
}));

const mockCreateWeight = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-2" }, notifications: [] }),
);
vi.mock("../application/medical/weight-use-case", () => ({
  createWeight: mockCreateWeight,
}));

const mockCreateDeworming = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-3" }, notifications: [] }),
);
vi.mock("../application/medical/deworming-use-case", () => ({
  createDeworming: mockCreateDeworming,
}));

vi.mock("../application/medical/sterilization-use-case", () => ({
  createSterilization: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/medical/medication-start-use-case", () => ({
  createMedicationStart: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/medical/medication-end-use-case", () => ({
  createMedicationEnd: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/medical/medication-dose-taken-use-case", () => ({
  markMedicationDoseTaken: vi.fn().mockResolvedValue({ ok: true, value: { petPublicToken: "x" } }),
}));
vi.mock("../application/identity/microchip-use-case", () => ({
  createMicrochip: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/identity/dangerous-breed-attestation-use-case", () => ({
  createDangerousBreedAttestation: vi
    .fn()
    .mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/identity/note-use-case", () => ({
  createNote: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/clinical/vet-visit-use-case", () => ({
  createVetVisit: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/clinical/clinical-info-use-case", () => ({
  createClinicalInfo: vi.fn().mockResolvedValue({ ok: true, value: {}, notifications: [] }),
}));
vi.mock("../application/clinical/record-disease-diagnosis-use-case", () => ({
  recordDiseaseDiagnosisWriter: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}));
const mockCreateDeathRecord = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, value: {} }));
vi.mock("../application/lifecycle/death-record-use-case", () => ({
  createDeathRecord: mockCreateDeathRecord,
}));
vi.mock("../application/lifecycle/set-pet-found-use-case", () => ({
  setPetFound: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../application/lifecycle/set-pet-lost-use-case", () => ({
  setPetLostWriter: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock("../application/lifecycle/update-lost-last-seen-use-case", () => ({
  updateLostLastSeen: vi.fn().mockResolvedValue({ error: null }),
}));
const mockCreateSymptomObservedWriter = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: {} }),
);
vi.mock("../application/surveillance/symptom-observed-use-case", () => ({
  createSymptomObservedWriter: mockCreateSymptomObservedWriter,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAliveAccess(overrides?: Partial<typeof BASE_PET>) {
  return {
    ok: true as const,
    supabase: { storage: { from: vi.fn().mockReturnValue({ remove: vi.fn() }) } },
    user: { id: "user-1" },
    pet: { ...BASE_PET, ...overrides },
    eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
    accessPath: "owner",
  };
}

function vaccinationFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("vaccineName", "Antirrábica");
  fd.set("occurredAt", "2026-07-08");
  for (const [k, v] of Object.entries(overrides ?? {})) fd.set(k, v);
  return fd;
}

function dewormingFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("product", "Frontline");
  fd.set("type", "external");
  fd.set("occurredAt", "2026-07-08");
  for (const [k, v] of Object.entries(overrides ?? {})) fd.set(k, v);
  return fd;
}

function weightFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("kg", "10");
  fd.set("occurredAt", "2026-07-08");
  for (const [k, v] of Object.entries(overrides ?? {})) fd.set(k, v);
  return fd;
}

// AR calendar-day fixtures — the guard compares ARGENTINE days, so "today"
// must be the AR day, not the runner's UTC day (they differ 21:00-24:00 AR).
const TODAY_AR = todayIsoInAr();
const TOMORROW_AR = (() => {
  const d = new Date(`${TODAY_AR}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
})();

function deathFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("cause", "natural");
  fd.set("occurredAt", TODAY_AR);
  for (const [k, v] of Object.entries(overrides ?? {})) fd.set(k, v);
  return fd;
}

function symptomFormData(overrides?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("freeText", "Vomita desde ayer");
  fd.set("onsetAt", TODAY_AR);
  for (const [k, v] of Object.entries(overrides ?? {})) fd.set(k, v);
  return fd;
}

describe("events/actions.ts — P4 plausibility layer", () => {
  let createWeightAction: typeof import("../actions-medical").createWeightAction;
  let createVaccinationAction: typeof import("../actions-medical").createVaccinationAction;
  let createDewormingAction: typeof import("../actions-medical").createDewormingAction;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequireAlivePetAccess.mockResolvedValue(makeAliveAccess());
    mockFindSameDayEventOfType.mockResolvedValue(null);
    mockRepoInsertEventIdempotent.mockResolvedValue({ event: { id: "evt-x" }, wasNoop: false });
    mockUploadAttachmentIfPresent.mockResolvedValue({
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: null,
    });

    // Moved to ../actions-medical on 2026-08-21 with the clinical family; the
    // behaviour under test is unchanged, only the module that holds it.
    const mod = await import("../actions-medical");
    createWeightAction = mod.createWeightAction;
    createVaccinationAction = mod.createVaccinationAction;
    createDewormingAction = mod.createDewormingAction;
  });

  // ---------------------------------------------------------------------
  // Item 2 — weight upper bound
  // ---------------------------------------------------------------------
  describe("createWeightAction — weight bound", () => {
    it("rejects a weight above the bound without calling the use-case or uploading", async () => {
      const result = await createWeightAction(
        "DIM-TEST-0001",
        { error: null },
        weightFormData({ kg: "500" }),
      );
      expect(result.error).toMatch(/no puede superar/i);
      expect(mockCreateWeight).not.toHaveBeenCalled();
      expect(mockUploadAttachmentIfPresent).not.toHaveBeenCalled();
    });

    it("accepts a weight at the bound", async () => {
      const result = await createWeightAction(
        "DIM-TEST-0001",
        { error: null },
        weightFormData({ kg: "120" }),
      );
      expect(result.error).toBeNull();
      expect(mockCreateWeight).toHaveBeenCalledOnce();
    });

    it("accepts a normal weight below the bound", async () => {
      const result = await createWeightAction(
        "DIM-TEST-0001",
        { error: null },
        weightFormData({ kg: "12.5" }),
      );
      expect(result.error).toBeNull();
      expect(mockCreateWeight).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------
  // Item 1 — plausibility wiring (representative call sites)
  // ---------------------------------------------------------------------
  describe("createWeightAction — plausibility", () => {
    it("rejects a future occurredAt", async () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      const result = await createWeightAction(
        "DIM-TEST-0001",
        { error: null },
        weightFormData({ occurredAt: farFuture.toISOString().slice(0, 10) }),
      );
      expect(result.error).toBe("La fecha no puede ser futura.");
      expect(mockCreateWeight).not.toHaveBeenCalled();
    });

    it("rejects an occurredAt before the pet's date of birth", async () => {
      mockRequireAlivePetAccess.mockResolvedValue(makeAliveAccess({ dateOfBirth: "2025-01-01" }));
      const result = await createWeightAction(
        "DIM-TEST-0001",
        { error: null },
        weightFormData({ occurredAt: "2020-01-01" }),
      );
      expect(result.error).toMatch(/anterior a la fecha de nacimiento/i);
      expect(mockCreateWeight).not.toHaveBeenCalled();
    });
  });

  describe("createVaccinationAction — plausibility", () => {
    it("rejects a future occurredAt before checking same-day duplicates", async () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      const result = await createVaccinationAction(
        "DIM-TEST-0001",
        { error: null },
        vaccinationFormData({ occurredAt: farFuture.toISOString().slice(0, 10) }),
      );
      expect(result.error).toBe("La fecha no puede ser futura.");
      expect(mockFindSameDayEventOfType).not.toHaveBeenCalled();
      expect(mockCreateVaccination).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Item 4 — same-day duplicate warn
  // ---------------------------------------------------------------------
  describe("createVaccinationAction — same-day duplicate warn", () => {
    it("returns a sameDayPrompt and does not insert or upload when a same-day event exists", async () => {
      mockFindSameDayEventOfType.mockResolvedValue({ id: "existing-evt" });
      const result = await createVaccinationAction(
        "DIM-TEST-0001",
        { error: null },
        vaccinationFormData(),
      );
      expect(result.error).toBeNull();
      expect(result.sameDayPrompt?.message).toContain("Firulais");
      expect(result.sameDayPrompt?.message).toContain("Antirrábica");
      expect(mockCreateVaccination).not.toHaveBeenCalled();
      expect(mockUploadAttachmentIfPresent).not.toHaveBeenCalled();
    });

    it("skips the same-day check and inserts when sameDayOverride=1", async () => {
      mockFindSameDayEventOfType.mockResolvedValue({ id: "existing-evt" });
      const result = await createVaccinationAction(
        "DIM-TEST-0001",
        { error: null },
        vaccinationFormData({ sameDayOverride: "1" }),
      );
      expect(result.sameDayPrompt).toBeUndefined();
      expect(mockFindSameDayEventOfType).not.toHaveBeenCalled();
      expect(mockCreateVaccination).toHaveBeenCalledOnce();
    });

    it("proceeds normally when there is no same-day duplicate", async () => {
      mockFindSameDayEventOfType.mockResolvedValue(null);
      const result = await createVaccinationAction(
        "DIM-TEST-0001",
        { error: null },
        vaccinationFormData(),
      );
      expect(result.sameDayPrompt).toBeUndefined();
      expect(mockCreateVaccination).toHaveBeenCalledOnce();
    });
  });

  describe("createDewormingAction — same-day duplicate warn", () => {
    it("returns a sameDayPrompt and does not insert or upload when a same-day event exists", async () => {
      mockFindSameDayEventOfType.mockResolvedValue({ id: "existing-evt" });
      const result = await createDewormingAction(
        "DIM-TEST-0001",
        { error: null },
        dewormingFormData(),
      );
      expect(result.error).toBeNull();
      expect(result.sameDayPrompt?.message).toContain("Firulais");
      expect(result.sameDayPrompt?.message).toContain("Frontline");
      expect(mockCreateDeworming).not.toHaveBeenCalled();
      expect(mockUploadAttachmentIfPresent).not.toHaveBeenCalled();
    });

    it("skips the same-day check and inserts when sameDayOverride=1", async () => {
      mockFindSameDayEventOfType.mockResolvedValue({ id: "existing-evt" });
      const result = await createDewormingAction(
        "DIM-TEST-0001",
        { error: null },
        dewormingFormData({ sameDayOverride: "1" }),
      );
      expect(result.sameDayPrompt).toBeUndefined();
      expect(mockFindSameDayEventOfType).not.toHaveBeenCalled();
      expect(mockCreateDeworming).toHaveBeenCalledOnce();
    });
  });

  // ---------------------------------------------------------------------
  // PO decision 2026-07-16 — guard the remaining guardless writers
  // ---------------------------------------------------------------------
  describe("createDeathRecordAction — plausibility", () => {
    it("accepts today's AR date and rejects tomorrow's", async () => {
      mockRequirePetAccess.mockResolvedValue(makeAliveAccess());
      const mod = await import("../actions");

      const ok = await mod.createDeathRecordAction(
        "DIM-TEST-0001",
        { error: null },
        deathFormData(),
      );
      expect(ok.error).toBeNull();
      expect(mockCreateDeathRecord).toHaveBeenCalledOnce();

      mockCreateDeathRecord.mockClear();
      const rejected = await mod.createDeathRecordAction(
        "DIM-TEST-0001",
        { error: null },
        deathFormData({ occurredAt: TOMORROW_AR }),
      );
      expect(rejected.error).toBe("La fecha no puede ser futura.");
      expect(mockCreateDeathRecord).not.toHaveBeenCalled();
    });
  });

  describe("createSymptomObservedAction — plausibility", () => {
    it("accepts today's AR onset and rejects tomorrow's", async () => {
      const mod = await import("../actions");

      const ok = await mod.createSymptomObservedAction(
        "DIM-TEST-0001",
        { error: null },
        symptomFormData(),
      );
      expect(ok.error).toBeNull();
      expect(mockCreateSymptomObservedWriter).toHaveBeenCalledOnce();

      mockCreateSymptomObservedWriter.mockClear();
      const rejected = await mod.createSymptomObservedAction(
        "DIM-TEST-0001",
        { error: null },
        symptomFormData({ onsetAt: TOMORROW_AR }),
      );
      expect(rejected.error).toBe("La fecha no puede ser futura.");
      expect(mockCreateSymptomObservedWriter).not.toHaveBeenCalled();
    });
  });
});
