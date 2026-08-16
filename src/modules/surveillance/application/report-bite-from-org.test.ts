// Unit tests for application/report-bite-from-org.ts (org path)
// Spec scenarios: B (report-bite org path)
// Strict TDD — tests written BEFORE implementation.
//
// KEY PARITY NOTE: org path was aligned to use insertIncidentEventIdempotent
// in fix/idempotency-guards (v1.0 data-integrity fix).

import { describe, expect, it, vi } from "vitest";

import { computeObservationUntil } from "../domain/rabies-observation";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import { type ReportBiteFromOrgInput, reportBiteFromOrg } from "./report-bite-from-org";

const FAKE_BITE_ORG_ID = "a0000000-0000-4000-8000-000000000003";
const FAKE_OBS_ORG_ID = "a0000000-0000-4000-8000-000000000004";

function makeRepo(overrides: Partial<Record<keyof SurveillanceRepository, unknown>> = {}) {
  return {
    findLatestRabiesVaccineEvent: vi.fn().mockResolvedValue(null),
    insertIncidentEventIdempotent: vi
      .fn()
      .mockResolvedValue({ event: { id: FAKE_BITE_ORG_ID }, wasNoop: false }),
    insertObservationStarted: vi.fn().mockResolvedValue({ id: FAKE_OBS_ORG_ID }),
    setObservationStatus: vi.fn().mockResolvedValue(undefined),
    findActiveOwnership: vi.fn().mockResolvedValue(null),
    findGovtTargetsForJurisdiction: vi.fn().mockResolvedValue([]),
    insertNotifications: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SurveillanceRepository;
}

function makeDeps(repoOverrides: Partial<Record<keyof SurveillanceRepository, unknown>> = {}) {
  const repo = makeRepo(repoOverrides);
  const openCase = vi.fn().mockResolvedValue({ id: "case-org-1", publicCode: "CAS-ORG1-2222" });
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb("fake-tx");
  });
  const findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue([]);
  const resolveObservationWindow = vi.fn().mockResolvedValue({ days: 10 });
  return { repo, openCase, transaction, findAuthoritiesForJurisdiction, resolveObservationWindow };
}

const BASE_INPUT: ReportBiteFromOrgInput = {
  pet: {
    id: "pet-2",
    publicToken: "tok-pet-2",
    name: "Max",
    species: "dog",
    status: "alive",
    rabiesObservationStatus: null,
    jurisdictionProvince: "CABA",
    jurisdictionLocality: "Palermo",
  },
  user: { id: "user-org-1" },
  organization: {
    id: "org-1",
    displayName: "Clinica Vet SA",
    orgType: "clinic",
    verified: true,
  },
  occurredAt: new Date("2024-07-01T09:00:00Z"),
  victimKind: "animal",
  severity: "moderate",
  locationDescription: "Parque",
  context: null,
  victimContactName: null,
  victimContactPhone: null,
  victimAgeEstimate: null,
  injuriesSummary: null,
  vetInvolved: false,
  eventJurisdictionProvince: null,
  eventJurisdictionLocality: null,
  locationLat: null,
  locationLng: null,
  locationSource: null,
  noRedirect: false,
  orgToken: "org-tok-1",
  clientIdempotencyKey: null,
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("reportBiteFromOrg (org path)", () => {
  it("returns ok=true on successful report", async () => {
    const deps = makeDeps();
    const result = await reportBiteFromOrg(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it("uses insertIncidentEventIdempotent (aligned with owner path)", async () => {
    const deps = makeDeps();
    await reportBiteFromOrg(BASE_INPUT, deps);
    expect(deps.repo.insertIncidentEventIdempotent).toHaveBeenCalled();
  });

  it("maps clinic orgType to reporter_role=vet", async () => {
    const deps = makeDeps();
    await reportBiteFromOrg(BASE_INPUT, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload.reporter_role).toBe("vet");
  });

  // panorama-event-points Slice 2: the org map pin persists COLUMNAR coords.
  it("persists the incident map-pin coordinate columnar + location_source in payload", async () => {
    const deps = makeDeps();
    await reportBiteFromOrg(
      { ...BASE_INPUT, locationLat: -31.42, locationLng: -64.18, locationSource: "gps" },
      deps,
    );
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      locationLat: unknown;
      locationLng: unknown;
      payload: Record<string, unknown>;
    };
    expect(call.locationLat).toBe("-31.42");
    expect(call.locationLng).toBe("-64.18");
    expect(call.payload.location_source).toBe("gps");
  });

  it("maps shelter orgType to reporter_role=shelter", async () => {
    const deps = makeDeps();
    const shelterInput = {
      ...BASE_INPUT,
      organization: { ...BASE_INPUT.organization, orgType: "shelter" },
    };
    await reportBiteFromOrg(shelterInput, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload.reporter_role).toBe("shelter");
  });

  it("maps rescue_network orgType to reporter_role=shelter", async () => {
    const deps = makeDeps();
    const input = {
      ...BASE_INPUT,
      organization: { ...BASE_INPUT.organization, orgType: "rescue_network" },
    };
    await reportBiteFromOrg(input, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload.reporter_role).toBe("shelter");
  });

  it("maps sanitary_authority to reporter_role=govt", async () => {
    const deps = makeDeps();
    const input = {
      ...BASE_INPUT,
      organization: { ...BASE_INPUT.organization, orgType: "sanitary_authority" },
    };
    await reportBiteFromOrg(input, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload.reporter_role).toBe("govt");
  });

  it("maps unknown orgType to reporter_role=witness", async () => {
    const deps = makeDeps();
    const input = {
      ...BASE_INPUT,
      organization: { ...BASE_INPUT.organization, orgType: "random_type" },
    };
    await reportBiteFromOrg(input, deps);
    const call = (deps.repo.insertIncidentEventIdempotent as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      payload: Record<string, unknown>;
    };
    expect(call.payload.reporter_role).toBe("witness");
  });

  it("calls openCase with openedByOrganizationId", async () => {
    const deps = makeDeps();
    await reportBiteFromOrg(BASE_INPUT, deps);
    expect(deps.openCase).toHaveBeenCalledWith(
      expect.objectContaining({ openedByOrganizationId: "org-1" }),
      "fake-tx",
    );
  });

  it("notifies active owner when ownership exists", async () => {
    const deps = makeDeps({
      findActiveOwnership: vi.fn().mockResolvedValue({ ownerUserId: "owner-user-99" }),
    });
    const result = await reportBiteFromOrg(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ownerNotif = result.notifications.find(
      (n) => n.notificationType === "bite_reported_by_org_owner",
    );
    expect(ownerNotif).toBeDefined();
    expect(ownerNotif?.userId).toBe("owner-user-99");
  });

  it("does NOT notify owner when no active ownership", async () => {
    const deps = makeDeps({
      findActiveOwnership: vi.fn().mockResolvedValue(null),
    });
    const result = await reportBiteFromOrg(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ownerNotif = result.notifications.find(
      (n) => n.notificationType === "bite_reported_by_org_owner",
    );
    expect(ownerNotif).toBeUndefined();
  });

  it("returns petToken and ok=true when noRedirect=true", async () => {
    const deps = makeDeps();
    const result = await reportBiteFromOrg({ ...BASE_INPUT, noRedirect: true }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.petToken).toBe("tok-pet-2");
    expect(result.value.casePublicCode).toBe("CAS-ORG1-2222");
  });

  it("uses eventJurisdiction for case if provided (overrides pet jurisdiction)", async () => {
    const deps = makeDeps();
    const input = {
      ...BASE_INPUT,
      eventJurisdictionProvince: "Córdoba",
      eventJurisdictionLocality: "Río Cuarto",
    };
    await reportBiteFromOrg(input, deps);
    expect(deps.openCase).toHaveBeenCalledWith(
      expect.objectContaining({
        jurisdictionProvince: "Córdoba",
        jurisdictionLocality: "Río Cuarto",
      }),
      "fake-tx",
    );
  });
});

// ---------------------------------------------------------------------------
// LEGAL-ROUTING fix — authority fan-out uses the INCIDENT jurisdiction, not
// the pet's home. PO decision: a bite routes to where it HAPPENED. The case
// override was already correct (test above); this pins the authority
// notification, which a prior audit found still used pet.jurisdictionProvince
// /Locality (the pet's home — Palermo, CABA per BASE_INPUT.pet) regardless.
// ---------------------------------------------------------------------------

describe("reportBiteFromOrg — incident jurisdiction overrides pet home jurisdiction", () => {
  const INCIDENT_ELSEWHERE_INPUT: ReportBiteFromOrgInput = {
    ...BASE_INPUT,
    // pet's home is jurisdiction A (CABA / Palermo, per BASE_INPUT.pet). The
    // bite happened in jurisdiction B.
    eventJurisdictionProvince: "Córdoba",
    eventJurisdictionLocality: "Río Cuarto",
  };

  it("notifies the incident jurisdiction's (B) authority, not the pet's home (A) authority", async () => {
    const deps = makeDeps();
    await reportBiteFromOrg(INCIDENT_ELSEWHERE_INPUT, deps);
    expect(deps.findAuthoritiesForJurisdiction).toHaveBeenCalledWith({
      province: "Córdoba",
      locality: "Río Cuarto",
    });
    expect(deps.findAuthoritiesForJurisdiction).not.toHaveBeenCalledWith({
      province: "CABA",
      locality: "Palermo",
    });
  });

  // A1 (Lote A): same convention as the pin above — the statutory window
  // resolves against the incident jurisdiction, and the stored deadline honors
  // the RESOLVED days, not the hardcoded 10.
  it("resolves the observation window against the incident jurisdiction and honors its days (A1)", async () => {
    const deps = makeDeps();
    deps.resolveObservationWindow.mockResolvedValue({ days: 14 });
    await reportBiteFromOrg(INCIDENT_ELSEWHERE_INPUT, deps);
    expect(deps.resolveObservationWindow).toHaveBeenCalledWith({
      province: "Córdoba",
      locality: "Río Cuarto",
    });
    expect(deps.repo.insertObservationStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          observation_until: computeObservationUntil(BASE_INPUT.occurredAt, 14).toISOString(),
        }),
      }),
      "fake-tx",
    );
  });
});
