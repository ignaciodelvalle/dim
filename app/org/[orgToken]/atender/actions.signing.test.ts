// Tests for the #5 vaccine-catalog server mirror and the #3 chip/esterilización
// sign-off actions (atenderMicrochipAction / atenderSterilizationAction).
//
// Module-level unit tests — mock every static import atender/actions.ts pulls
// in so we verify action-edge orchestration without a DB. Mirrors
// ./actions.plausibility.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayIsoInAr } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const BASE_PET = {
  id: "pet-1",
  publicToken: "DIM-TEST-0001",
  name: "Firulais",
  species: "dog",
  status: "active" as const,
  dateOfBirth: "2020-01-01",
};

const mockResolveAtenderPet = vi.hoisted(() => vi.fn());
vi.mock("./atender-access", () => ({
  ATENDER_TOKEN_PATTERN: /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
  normalizeAtenderToken: (raw: string) => raw.trim().toUpperCase(),
  resolveAtenderPet: mockResolveAtenderPet,
}));

const mockRejectIfAlreadySigned = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("./atender-declared-events", () => ({
  rejectIfAlreadySigned: mockRejectIfAlreadySigned,
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
  },
}));

const mockNotifyOwners = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/infra/notify-owners-of-clinical-event", () => ({
  notifyOwnersOfClinicalEvent: mockNotifyOwners,
}));

const mockUploadAttachmentIfPresent = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ uploadedPath: null, mimeType: null, size: null, error: null }),
);
vi.mock("@/lib/infra/uploads", () => ({
  uploadAttachmentIfPresent: mockUploadAttachmentIfPresent,
}));

const mockFetchActiveIdentifications = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ microchip: null, tattoo: null }),
);
vi.mock("@/lib/infra/pet-identifiers", () => ({
  fetchActiveIdentifications: mockFetchActiveIdentifications,
}));

vi.mock("@/lib/reference/drugs", () => ({
  findDrugByLabel: vi.fn().mockReturnValue(null),
}));

const mockFindVaccineByName = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reference/lookups", () => ({
  findVaccineByName: mockFindVaccineByName,
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    storage: { from: vi.fn().mockReturnValue({ remove: vi.fn() }) },
  }),
}));

const mockCreateVaccination = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-1" } }),
);
vi.mock("@/src/modules/events/application/medical/vaccination-use-case", () => ({
  createVaccination: mockCreateVaccination,
}));

vi.mock("@/src/modules/events/application/medical/deworming-use-case", () => ({
  createDeworming: vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-2" } }),
}));

vi.mock("@/src/modules/events/application/clinical/clinical-info-use-case", () => ({
  createClinicalInfo: vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-3" } }),
}));

vi.mock("@/src/modules/events/application/medical/medication-start-use-case", () => ({
  createMedicationStart: vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-4" } }),
}));

vi.mock("@/src/modules/events/application/identity/note-use-case", () => ({
  createNote: vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-5" } }),
}));

const mockCreateMicrochip = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-6" } }),
);
vi.mock("@/src/modules/events/application/identity/microchip-use-case", () => ({
  createMicrochip: mockCreateMicrochip,
}));

const mockCreateSterilization = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ ok: true, value: { eventId: "evt-7" } }),
);
vi.mock("@/src/modules/events/application/medical/sterilization-use-case", () => ({
  createSterilization: mockCreateSterilization,
}));

vi.mock("@/src/modules/events/infrastructure/events-repository", () => ({
  EventsRepository: class EventsRepository {},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TODAY_AR = todayIsoInAr();

function makeAccess(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    user: { id: "user-1" },
    organizationId: "org-1",
    organizationName: "Clinica Test",
    pet: { ...BASE_PET },
    signer: { label: "Dra. Test", matriculaVerified: true },
    eventAuthorship: { authorRole: "vet", authorOrganizationId: "org-1", authorVerified: true },
    error: null,
    ...overrides,
  };
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("atenderVaccinationAction — vaccine catalog gate server mirror (#5)", () => {
  let actions: typeof import("./actions");

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveAtenderPet.mockResolvedValue(makeAccess());
    mockUploadAttachmentIfPresent.mockResolvedValue({
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: null,
    });
    actions = await import("./actions");
  });

  it("accepts a catalogued vaccine name", async () => {
    mockFindVaccineByName.mockReturnValue({
      name: "Antirrábica",
      species: ["dog"],
      isCore: true,
      intervalMonths: 12,
    });
    const result = await actions.atenderVaccinationAction(
      "ORG-1",
      "DIM-TEST-0001",
      { error: null },
      formData({ vaccineName: "Antirrábica", occurredAt: TODAY_AR }),
    );
    expect(result.error).toBeNull();
    expect(mockCreateVaccination).toHaveBeenCalledOnce();
  });

  it("rejects an uncatalogued vaccine name with no flag in notes", async () => {
    mockFindVaccineByName.mockReturnValue(null);
    const result = await actions.atenderVaccinationAction(
      "ORG-1",
      "DIM-TEST-0001",
      { error: null },
      formData({ vaccineName: "Vacuna Rarísima", occurredAt: TODAY_AR }),
    );
    expect(result.error).toMatch(/no está en el catálogo/i);
    expect(mockCreateVaccination).not.toHaveBeenCalled();
  });

  it("accepts an uncatalogued vaccine name when notes carry the uncatalogued flag", async () => {
    mockFindVaccineByName.mockReturnValue(null);
    const result = await actions.atenderVaccinationAction(
      "ORG-1",
      "DIM-TEST-0001",
      { error: null },
      formData({
        vaccineName: "Vacuna Rarísima",
        occurredAt: TODAY_AR,
        notes: "vacuna no catalogada: Vacuna Rarísima",
      }),
    );
    expect(result.error).toBeNull();
    expect(mockCreateVaccination).toHaveBeenCalledOnce();
  });
});

describe("atenderMicrochipAction — declared-by-owner sign-off (#3)", () => {
  let actions: typeof import("./actions");

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveAtenderPet.mockResolvedValue(makeAccess());
    mockRejectIfAlreadySigned.mockResolvedValue(null);
    mockFetchActiveIdentifications.mockResolvedValue({ microchip: null, tattoo: null });
    mockUploadAttachmentIfPresent.mockResolvedValue({
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: null,
    });
    actions = await import("./actions");
  });

  it("signs a fresh chip entry (no confirmEventId) with vet-verified provenance", async () => {
    const result = await actions.atenderMicrochipAction(
      "ORG-1",
      "DIM-TEST-0001",
      null,
      { error: null },
      formData({ chipNumber: "985141004321456", occurredAt: TODAY_AR }),
    );
    expect(result.error).toBeNull();
    expect(mockCreateMicrochip).toHaveBeenCalledOnce();
    expect(mockCreateMicrochip).toHaveBeenCalledWith(
      expect.objectContaining({
        eventAuthorship: { authorRole: "vet", authorOrganizationId: "org-1", authorVerified: true },
      }),
      expect.anything(),
    );
    // Signing never touches the guard's target lookup when nothing is being confirmed.
    expect(mockRejectIfAlreadySigned).not.toHaveBeenCalled();
  });

  it("confirms a still-pending declared event (confirmEventId given, guard allows)", async () => {
    mockRejectIfAlreadySigned.mockResolvedValue(null);
    const result = await actions.atenderMicrochipAction(
      "ORG-1",
      "DIM-TEST-0001",
      "declared-evt-1",
      { error: null },
      formData({ chipNumber: "985141004321456", occurredAt: TODAY_AR }),
    );
    expect(result.error).toBeNull();
    // RA-2 F2: the SIGNER's provenance is part of the guard's question — a
    // non-matriculated member's record can be a duplicate at their own tier
    // even though it never reaches the professional bar. Forwarding it is not
    // optional; without it the guard cannot tell the two signer tiers apart.
    expect(mockRejectIfAlreadySigned).toHaveBeenCalledWith(
      "pet-1",
      "microchip_implanted",
      "declared-evt-1",
      { authorRole: "vet", authorOrganizationId: "org-1", authorVerified: true },
    );
    expect(mockCreateMicrochip).toHaveBeenCalledOnce();
  });

  it("rejects (no-op) signing an already-verified declared event — append-only preserved", async () => {
    mockRejectIfAlreadySigned.mockResolvedValue({
      error: "Este registro ya fue firmado por un profesional.",
    });
    const result = await actions.atenderMicrochipAction(
      "ORG-1",
      "DIM-TEST-0001",
      "declared-evt-1",
      { error: null },
      formData({ chipNumber: "985141004321456", occurredAt: TODAY_AR }),
    );
    expect(result.error).toMatch(/ya fue firmado/i);
    // No new event is written — the guard short-circuits before the writer call.
    expect(mockCreateMicrochip).not.toHaveBeenCalled();
  });
});

describe("atenderSterilizationAction — declared-by-owner sign-off (#3)", () => {
  let actions: typeof import("./actions");

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveAtenderPet.mockResolvedValue(makeAccess());
    mockRejectIfAlreadySigned.mockResolvedValue(null);
    mockUploadAttachmentIfPresent.mockResolvedValue({
      uploadedPath: null,
      mimeType: null,
      size: null,
      error: null,
    });
    actions = await import("./actions");
  });

  it("signs a fresh sterilization entry (no confirmEventId) with vet-verified provenance", async () => {
    const result = await actions.atenderSterilizationAction(
      "ORG-1",
      "DIM-TEST-0001",
      null,
      { error: null },
      formData({ procedure: "castration", occurredAt: TODAY_AR }),
    );
    expect(result.error).toBeNull();
    expect(mockCreateSterilization).toHaveBeenCalledOnce();
    expect(mockCreateSterilization).toHaveBeenCalledWith(
      expect.objectContaining({
        eventAuthorship: { authorRole: "vet", authorOrganizationId: "org-1", authorVerified: true },
      }),
      expect.anything(),
    );
  });

  it("rejects (no-op) signing an already-verified declared event — append-only preserved", async () => {
    mockRejectIfAlreadySigned.mockResolvedValue({
      error: "Este registro ya fue firmado por un profesional.",
    });
    const result = await actions.atenderSterilizationAction(
      "ORG-1",
      "DIM-TEST-0001",
      "declared-evt-2",
      { error: null },
      formData({ procedure: "spay", occurredAt: TODAY_AR }),
    );
    expect(result.error).toMatch(/ya fue firmado/i);
    expect(mockCreateSterilization).not.toHaveBeenCalled();
  });

  it("rejects an unknown procedure before touching the sign-off guard", async () => {
    const result = await actions.atenderSterilizationAction(
      "ORG-1",
      "DIM-TEST-0001",
      "declared-evt-2",
      { error: null },
      formData({ procedure: "unknown-proc", occurredAt: TODAY_AR }),
    );
    expect(result.error).toBe("Procedimiento inválido.");
    expect(mockRejectIfAlreadySigned).not.toHaveBeenCalled();
    expect(mockCreateSterilization).not.toHaveBeenCalled();
  });
});
