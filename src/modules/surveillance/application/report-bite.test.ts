// Unit tests for application/report-bite.ts (owner path)
// Spec scenarios: A (report-bite owner path)
// Strict TDD — tests written BEFORE implementation.
//
// Dependencies are mocked via vitest.fn(). No DB needed.

import { describe, expect, it, vi } from "vitest";

import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import { type ReportBiteInput, reportBite } from "./report-bite";

// ---------------------------------------------------------------------------
// Minimal fake types
// ---------------------------------------------------------------------------

type FakeRepo = {
  [K in keyof SurveillanceRepository]?: ReturnType<typeof vi.fn>;
};

const FAKE_BITE_ID = "a0000000-0000-4000-8000-000000000001";
const FAKE_OBS_ID = "a0000000-0000-4000-8000-000000000002";

function makeRepo(overrides: FakeRepo = {}): SurveillanceRepository {
  return {
    findLatestRabiesVaccineEvent: vi.fn().mockResolvedValue(null),
    insertIncidentEventIdempotent: vi.fn().mockResolvedValue({
      event: { id: FAKE_BITE_ID },
      wasNoop: false,
    }),
    insertObservationStarted: vi.fn().mockResolvedValue({ id: FAKE_OBS_ID }),
    setObservationStatus: vi.fn().mockResolvedValue(undefined),
    findGovtTargetsForJurisdiction: vi.fn().mockResolvedValue([]),
    insertNotifications: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SurveillanceRepository;
}

function makeDeps(repoOverrides: FakeRepo = {}) {
  const repo = makeRepo(repoOverrides);
  const openCase = vi.fn().mockResolvedValue({ id: "case-1", publicCode: "CAS-AAAA-BBBB" });
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb("fake-tx");
  });
  const findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue([]);
  return { repo, openCase, transaction, findAuthoritiesForJurisdiction };
}

const BASE_INPUT: ReportBiteInput = {
  pet: {
    id: "pet-1",
    publicToken: "tok-1",
    name: "Firulais",
    species: "dog",
    status: "alive",
    rabiesObservationStatus: null,
    jurisdictionProvince: "Buenos Aires",
    jurisdictionLocality: "Lomas de Zamora",
  },
  user: { id: "user-1" },
  eventAuthorship: { authorRole: "owner", authorOrganizationId: null, authorVerified: false },
  occurredAt: new Date("2024-06-01T10:00:00Z"),
  victimKind: "human",
  severity: "minor",
  locationDescription: null,
  context: null,
  victimContactName: null,
  victimContactPhone: null,
  victimAgeEstimate: null,
  clientIdempotencyKey: "key-abc",
  eventJurisdictionProvince: null,
  eventJurisdictionLocality: null,
  locationLat: null,
  locationLng: null,
  locationSource: null,
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("reportBite (owner path)", () => {
  it("returns ok=true on successful bite report", async () => {
    const deps = makeDeps();
    const result = await reportBite(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it("returns the opened case public code for the receipt", async () => {
    const deps = makeDeps();
    const result = await reportBite(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.casePublicCode).toBe("CAS-AAAA-BBBB");
  });

  it("calls openCase with bite_incident kind", async () => {
    const deps = makeDeps();
    await reportBite(BASE_INPUT, deps);
    expect(deps.openCase).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "bite_incident" }),
      "fake-tx",
    );
  });

  it("calls insertIncidentEventIdempotent (owner path uses idempotent insert)", async () => {
    const deps = makeDeps();
    await reportBite(BASE_INPUT, deps);
    expect(deps.repo.insertIncidentEventIdempotent).toHaveBeenCalled();
  });

  it("calls setObservationStatus with in_progress", async () => {
    const deps = makeDeps();
    await reportBite(BASE_INPUT, deps);
    expect(deps.repo.setObservationStatus).toHaveBeenCalledWith(
      "pet-1",
      "in_progress",
      expect.any(Date),
      "fake-tx",
    );
  });

  it("returns notification for owner with rabies_observation_started_owner type", async () => {
    const deps = makeDeps();
    const result = await reportBite(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ownerNotif = result.notifications.find(
      (n) => n.notificationType === "rabies_observation_started_owner",
    );
    expect(ownerNotif).toBeDefined();
    expect(ownerNotif?.userId).toBe("user-1");
  });

  it("computes rabies vaccine validity via repo.findLatestRabiesVaccineEvent", async () => {
    const deps = makeDeps({
      findLatestRabiesVaccineEvent: vi.fn().mockResolvedValue({
        occurredAt: new Date("2023-01-01"),
        payload: { vaccine_name: "antirrábica", next_due_at: "2025-01-01" },
      }),
    });
    await reportBite(BASE_INPUT, deps);
    // Should call the repo to get vaccine event
    expect(deps.repo.findLatestRabiesVaccineEvent).toHaveBeenCalledWith("pet-1");
  });

  it("sets rabiesVaccineValidAtIncident=true when vaccine still valid", async () => {
    const deps = makeDeps({
      findLatestRabiesVaccineEvent: vi.fn().mockResolvedValue({
        occurredAt: new Date("2023-01-01"),
        payload: {
          vaccine_name: "antirrábica",
          next_due_at: new Date("2030-01-01").toISOString(),
        },
      }),
    });
    await reportBite(BASE_INPUT, deps);
    // insertIncidentEventIdempotent should be called with the payload including the flag
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload.rabies_vaccine_valid_at_incident).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// panorama-event-points Slice 2 — incident coordinate capture
// ---------------------------------------------------------------------------

describe("reportBite — incident coordinate (Slice 2)", () => {
  it("persists the map-pin coordinate COLUMNAR (as numeric strings) + location_source in payload", async () => {
    const deps = makeDeps();
    await reportBite(
      {
        ...BASE_INPUT,
        locationLat: -34.6037,
        locationLng: -58.3816,
        locationSource: "pin_manual",
      },
      deps,
    );
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      locationLat: unknown;
      locationLng: unknown;
      payload: Record<string, unknown>;
    };
    // Columnar coordinate (numeric-string), NOT in the payload.
    expect(call.locationLat).toBe("-34.6037");
    expect(call.locationLng).toBe("-58.3816");
    // Precision hint travels in the payload.
    expect(call.payload.location_source).toBe("pin_manual");
  });

  it("writes NULL columnar coords when no pin was dropped (falls into the residual, never faked)", async () => {
    const deps = makeDeps();
    await reportBite(BASE_INPUT, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      locationLat: unknown;
      locationLng: unknown;
      payload: Record<string, unknown>;
    };
    expect(call.locationLat).toBeNull();
    expect(call.locationLng).toBeNull();
    expect(call.payload.location_source).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Idempotency noop path (spec §A: biteNoop early return)
// ---------------------------------------------------------------------------

describe("reportBite — idempotency noop", () => {
  it("returns ok=true but does NOT call insertObservationStarted when biteNoop=true", async () => {
    const deps = makeDeps({
      insertIncidentEventIdempotent: vi.fn().mockResolvedValue({
        event: { id: "evt-bite-1" },
        wasNoop: true,
      }),
    });
    const result = await reportBite(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.repo.insertObservationStarted).not.toHaveBeenCalled();
    expect(deps.repo.setObservationStatus).not.toHaveBeenCalled();
  });

  it("returns empty notifications on noop", async () => {
    const deps = makeDeps({
      insertIncidentEventIdempotent: vi.fn().mockResolvedValue({
        event: { id: "evt-bite-1" },
        wasNoop: true,
      }),
    });
    const result = await reportBite(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.notifications).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Authority notification fan-out (spec §A fan-out)
// ---------------------------------------------------------------------------

describe("reportBite — authority fan-out", () => {
  it("calls findAuthoritiesForJurisdiction with pet jurisdiction", async () => {
    const deps = makeDeps();
    await reportBite(BASE_INPUT, deps);
    expect(deps.findAuthoritiesForJurisdiction).toHaveBeenCalledWith({
      province: "Buenos Aires",
      locality: "Lomas de Zamora",
    });
  });

  it("includes authority notifications when authorities found (severity=warning for minor)", async () => {
    const deps = makeDeps();
    deps.findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue(["auth-user-1"]);
    const result = await reportBite(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const authNotif = result.notifications.find(
      (n) => n.notificationType === "bite_reported_authority",
    );
    expect(authNotif).toBeDefined();
    expect(authNotif?.userId).toBe("auth-user-1");
    expect(authNotif?.severity).toBe("warning");
  });

  it("uses severity=urgent for severe bites", async () => {
    const deps = makeDeps();
    deps.findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue(["auth-user-1"]);
    const result = await reportBite({ ...BASE_INPUT, severity: "severe" }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const authNotif = result.notifications.find(
      (n) => n.notificationType === "bite_reported_authority",
    );
    expect(authNotif?.severity).toBe("urgent");
  });

  it("skips authority notifications when no pet jurisdiction", async () => {
    const deps = makeDeps();
    deps.findAuthoritiesForJurisdiction = vi.fn();
    const petNoJurisdiction = {
      ...BASE_INPUT,
      pet: {
        ...BASE_INPUT.pet,
        jurisdictionProvince: null,
        jurisdictionLocality: null,
      },
    };
    await reportBite(petNoJurisdiction, deps);
    expect(deps.findAuthoritiesForJurisdiction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// LEGAL-ROUTING fix — incident jurisdiction overrides pet home jurisdiction
// (PO decision: a bite routes to where it HAPPENED, not the pet's registered
// home). A prior audit found both the opened case and the authority
// notification always used pet.jurisdictionProvince/Locality — pinned here so
// a regression can't silently bring back the home-jurisdiction routing.
// ---------------------------------------------------------------------------

describe("reportBite — incident jurisdiction overrides pet home jurisdiction", () => {
  const INCIDENT_ELSEWHERE_INPUT: ReportBiteInput = {
    ...BASE_INPUT,
    // pet's home is jurisdiction A (Buenos Aires / Lomas de Zamora, per
    // BASE_INPUT.pet). The bite happened in jurisdiction B.
    eventJurisdictionProvince: "Córdoba",
    eventJurisdictionLocality: "Río Cuarto",
  };

  it("opens the bite_incident case in the incident jurisdiction (B), not the pet's home (A)", async () => {
    const deps = makeDeps();
    await reportBite(INCIDENT_ELSEWHERE_INPUT, deps);
    expect(deps.openCase).toHaveBeenCalledWith(
      expect.objectContaining({
        jurisdictionProvince: "Córdoba",
        jurisdictionLocality: "Río Cuarto",
      }),
      "fake-tx",
    );
  });

  it("notifies the incident jurisdiction's (B) authority, not the pet's home (A) authority", async () => {
    const deps = makeDeps();
    await reportBite(INCIDENT_ELSEWHERE_INPUT, deps);
    expect(deps.findAuthoritiesForJurisdiction).toHaveBeenCalledWith({
      province: "Córdoba",
      locality: "Río Cuarto",
    });
    expect(deps.findAuthoritiesForJurisdiction).not.toHaveBeenCalledWith({
      province: "Buenos Aires",
      locality: "Lomas de Zamora",
    });
  });
});

// ---------------------------------------------------------------------------
// Vaccine validity at bite date (parity quirk #1)
// ---------------------------------------------------------------------------

describe("reportBite — vaccine validity snapshot", () => {
  it("sets rabiesVaccineValidAtIncident=false when no vaccine on record", async () => {
    const deps = makeDeps({
      findLatestRabiesVaccineEvent: vi.fn().mockResolvedValue(null),
    });
    await reportBite(BASE_INPUT, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload.rabies_vaccine_valid_at_incident).toBe(false);
  });

  it("sets rabiesVaccineValidAtIncident=false when vaccine expired via next_due_at", async () => {
    const biteDate = new Date("2024-06-01T10:00:00Z");
    const deps = makeDeps({
      findLatestRabiesVaccineEvent: vi.fn().mockResolvedValue({
        occurredAt: new Date("2022-01-01"),
        payload: {
          vaccine_name: "rabies",
          next_due_at: new Date("2023-01-01").toISOString(), // expired
        },
      }),
    });
    await reportBite({ ...BASE_INPUT, occurredAt: biteDate }, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload.rabies_vaccine_valid_at_incident).toBe(false);
  });
});
