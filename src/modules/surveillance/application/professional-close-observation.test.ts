// Unit tests for application/professional-close-observation.ts (spec §D)
// Strict TDD — tests written BEFORE implementation.
//
// CRITICAL parity test: out-of-jurisdiction govt user MUST be rejected.
// This is the cross-org bypass lesson from the welfare module.

import { describe, expect, it, vi } from "vitest";

import type { PetEvent } from "@/db/schema";
import type { SurveillanceRepository } from "../infrastructure/surveillance-repository";
import {
  type ProfessionalCloseObservationInput,
  professionalCloseObservation,
} from "./professional-close-observation";

type FakeRepo = Partial<Record<keyof SurveillanceRepository, ReturnType<typeof vi.fn>>>;

const FAKE_BITE_ID = "a0000000-0000-4000-8000-000000000005";
const FAKE_STARTED_ID = "a0000000-0000-4000-8000-000000000006";

function makeStartedEvent(): PetEvent {
  return {
    id: FAKE_STARTED_ID,
    petId: "pet-3",
    eventType: "rabies_observation_started",
    occurredAt: new Date("2024-08-01"),
    recordedAt: new Date("2024-08-01"),
    recordedByUserId: "user-org",
    authorRole: "vet",
    authorOrganizationId: "org-1",
    authorVerified: true,
    payload: {
      bite_event_id: FAKE_BITE_ID,
      observation_until: new Date("2024-08-11").toISOString(),
      location: "in_situ",
      official_site_organization_id: null,
    },
    caseId: "case-2",
    clientIdempotencyKey: null,
    createdAt: new Date("2024-08-01"),
  } as unknown as PetEvent;
}

function makeRepo(overrides: FakeRepo = {}): SurveillanceRepository {
  return {
    findPetByToken: vi.fn().mockResolvedValue({
      id: "pet-3",
      publicToken: "tok-prof-1",
      name: "Luna",
      species: "cat",
      status: "alive",
      rabiesObservationStatus: "in_progress",
      jurisdictionProvince: "Buenos Aires",
      jurisdictionLocality: "La Plata",
    }),
    findLatestObservationStarted: vi.fn().mockResolvedValue(makeStartedEvent()),
    findOpenBiteCase: vi.fn().mockResolvedValue({ id: "case-2" }),
    insertObservationEnded: vi.fn().mockResolvedValue(undefined),
    setObservationStatus: vi.fn().mockResolvedValue(undefined),
    findActiveOwnership: vi.fn().mockResolvedValue(null),
    insertObservationCloseAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SurveillanceRepository;
}

function makeDeps(repoOverrides: FakeRepo = {}) {
  const repo = makeRepo(repoOverrides);
  const closeCase = vi.fn().mockResolvedValue(undefined);
  const transaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb("fake-tx");
  });
  return { repo, closeCase, transaction };
}

// Admin actor — universal scope
const ADMIN_ACTOR = {
  profile: { id: "admin-user-1", role: "admin" as const },
  jurisdictions: [] as Array<{ province: string; locality: string }>,
};

// Govt actor IN jurisdiction
const GOVT_IN_JURISDICTION = {
  profile: { id: "govt-user-1", role: "govt" as const },
  jurisdictions: [{ province: "Buenos Aires", locality: "La Plata" }],
};

// Govt actor OUT of jurisdiction — MUST BE REJECTED
const GOVT_OUT_JURISDICTION = {
  profile: { id: "govt-user-2", role: "govt" as const },
  jurisdictions: [{ province: "Córdoba", locality: "Río Cuarto" }],
};

const BASE_INPUT: ProfessionalCloseObservationInput = {
  petPublicToken: "tok-prof-1",
  outcome: "negative",
  closureNotes: null,
  actor: ADMIN_ACTOR,
};

// ---------------------------------------------------------------------------
// Admin happy path (universal scope)
// ---------------------------------------------------------------------------

describe("professionalCloseObservation — admin actor", () => {
  it("returns ok=true for admin with any outcome", async () => {
    const deps = makeDeps();
    const result = await professionalCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
  });

  it("inserts rabies_observation_ended with outcome passed", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, outcome: "positive_rabies" }, deps);
    const call = (deps.repo.insertObservationEnded as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload.outcome).toBe("positive_rabies");
  });

  it("stores authorRole=govt regardless of admin role (column-level parity)", async () => {
    const deps = makeDeps();
    await professionalCloseObservation(BASE_INPUT, deps);
    const call = (deps.repo.insertObservationEnded as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { authorRole: string };
    expect(call.authorRole).toBe("govt");
  });

  it("closes case with reason=resolved for outcome=negative", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, outcome: "negative" }, deps);
    expect(deps.closeCase).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "resolved" }),
      "fake-tx",
    );
  });

  it("closes case with reason=cancelled for outcome=lost_to_followup", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, outcome: "lost_to_followup" }, deps);
    expect(deps.closeCase).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "cancelled" }),
      "fake-tx",
    );
  });

  it("includes owner notification with urgent severity for positive_rabies", async () => {
    const deps = makeDeps({
      findActiveOwnership: vi.fn().mockResolvedValue({ ownerUserId: "owner-99" }),
    });
    const result = await professionalCloseObservation(
      { ...BASE_INPUT, outcome: "positive_rabies" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notif = result.notifications.find(
      (n) => n.notificationType === "rabies_observation_completed_professional_owner",
    );
    expect(notif?.severity).toBe("urgent");
  });

  it("includes owner notification with info severity for negative", async () => {
    const deps = makeDeps({
      findActiveOwnership: vi.fn().mockResolvedValue({ ownerUserId: "owner-99" }),
    });
    const result = await professionalCloseObservation({ ...BASE_INPUT, outcome: "negative" }, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notif = result.notifications.find(
      (n) => n.notificationType === "rabies_observation_completed_professional_owner",
    );
    expect(notif?.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// Positive rabies escalation + incomplete payload resilience (QA 2026-07-08)
// ---------------------------------------------------------------------------

describe("professionalCloseObservation — positive rabies escalation", () => {
  it("fans out an urgent authority notification on positive_rabies close", async () => {
    const deps = makeDeps();
    const findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue(["auth-1", "auth-2"]);
    const result = await professionalCloseObservation(
      { ...BASE_INPUT, outcome: "positive_rabies" },
      { ...deps, findAuthoritiesForJurisdiction },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findAuthoritiesForJurisdiction).toHaveBeenCalledWith({
      province: "Buenos Aires",
      locality: "La Plata",
    });
    const authNotifs = result.notifications.filter(
      (n) => n.notificationType === "rabies_observation_positive_authority",
    );
    expect(authNotifs).toHaveLength(2);
    expect(authNotifs.every((n) => n.severity === "urgent")).toBe(true);
  });

  it("does NOT fan out to authorities for a negative close", async () => {
    const deps = makeDeps();
    const findAuthoritiesForJurisdiction = vi.fn().mockResolvedValue(["auth-1"]);
    const result = await professionalCloseObservation(BASE_INPUT, {
      ...deps,
      findAuthoritiesForJurisdiction,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(findAuthoritiesForJurisdiction).not.toHaveBeenCalled();
    expect(
      result.notifications.some(
        (n) => n.notificationType === "rabies_observation_positive_authority",
      ),
    ).toBe(false);
  });
});

describe("professionalCloseObservation — resilient close for incomplete payloads", () => {
  it("closes cleanly when the started event has NO bite_event_id (records null)", async () => {
    const startedNoBite = {
      ...makeStartedEvent(),
      payload: {
        observation_until: new Date("2024-08-11").toISOString(),
        location: "in_situ",
        official_site_organization_id: null,
      },
    } as unknown as PetEvent;
    const deps = makeDeps({
      findLatestObservationStarted: vi.fn().mockResolvedValue(startedNoBite),
    });
    const result = await professionalCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    const call = (deps.repo.insertObservationEnded as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload.bite_event_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Govt actor — jurisdiction scope enforcement (CRITICAL: cross-org bypass guard)
// ---------------------------------------------------------------------------

describe("professionalCloseObservation — govt jurisdiction scope", () => {
  it("returns ok=true when govt is in jurisdiction", async () => {
    const deps = makeDeps();
    const result = await professionalCloseObservation(
      { ...BASE_INPUT, actor: GOVT_IN_JURISDICTION },
      deps,
    );
    expect(result.ok).toBe(true);
  });

  it("REJECTS govt actor whose jurisdiction does NOT match the pet's jurisdiction", async () => {
    const deps = makeDeps();
    const result = await professionalCloseObservation(
      { ...BASE_INPUT, actor: GOVT_OUT_JURISDICTION },
      deps,
    );
    // This is the parity test proving out-of-jurisdiction govt is REJECTED
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no está dentro de tu cobertura asignada/i);
  });

  it("does NOT call insertObservationEnded when govt is out of jurisdiction", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, actor: GOVT_OUT_JURISDICTION }, deps);
    expect(deps.repo.insertObservationEnded).not.toHaveBeenCalled();
  });

  it("does NOT close the case when govt is out of jurisdiction", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, actor: GOVT_OUT_JURISDICTION }, deps);
    expect(deps.closeCase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error paths (spec §D negatives)
// ---------------------------------------------------------------------------

describe("professionalCloseObservation — error paths", () => {
  it("returns error when pet not found", async () => {
    const deps = makeDeps({
      findPetByToken: vi.fn().mockResolvedValue(null),
    });
    const result = await professionalCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/mascota no encontrada/i);
  });

  it("returns error when pet has no active observation", async () => {
    const deps = makeDeps({
      findPetByToken: vi.fn().mockResolvedValue({
        id: "pet-3",
        publicToken: "tok-prof-1",
        name: "Luna",
        species: "cat",
        status: "alive",
        rabiesObservationStatus: "completed_negative",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      }),
    });
    const result = await professionalCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no tiene una observación abierta/i);
  });

  it("ACCEPTS a window_expired_unclosed observation — that is the queue it drains", async () => {
    const deps = makeDeps({
      findPetByToken: vi.fn().mockResolvedValue({
        id: "pet-3",
        publicToken: "tok-prof-1",
        name: "Luna",
        species: "cat",
        status: "alive",
        rabiesObservationStatus: "window_expired_unclosed",
        jurisdictionProvince: "Buenos Aires",
        jurisdictionLocality: "La Plata",
      }),
    });
    const result = await professionalCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(true);
    expect(deps.repo.setObservationStatus).toHaveBeenCalledWith(
      "pet-3",
      "completed_negative",
      expect.any(Date),
      "fake-tx",
    );
  });

  it("returns error when no started event found (internal inconsistency)", async () => {
    const deps = makeDeps({
      findLatestObservationStarted: vi.fn().mockResolvedValue(null),
    });
    const result = await professionalCloseObservation(BASE_INPUT, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/inconsistencia/i);
  });
});

// ---------------------------------------------------------------------------
// Audit log — REQUIRED since 2026-08-17
//
// This close is the only path by which a clinical outcome enters the record, so
// the administrative act carries an audit row with before/after state, written
// inside the same transaction as the mutation it describes.
// ---------------------------------------------------------------------------

describe("professionalCloseObservation — audit_log", () => {
  it("writes rabies_observation_closed_professional with before/after state", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, outcome: "positive_rabies" }, deps);
    const spy = deps.repo.insertObservationCloseAuditLog as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledTimes(1);
    const [entry, executor] = spy.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(entry.action).toBe("rabies_observation_closed_professional");
    expect(entry.actorUserId).toBe("admin-user-1");
    expect(entry.before).toEqual({ rabies_observation_status: "in_progress" });
    expect(entry.after).toEqual({ rabies_observation_status: "completed_positive_rabies" });
    // Same transaction as the close — a rollback must take the audit row too.
    expect(executor).toBe("fake-tx");
  });

  it("writes NO audit row when the close is refused (out-of-jurisdiction govt)", async () => {
    const deps = makeDeps();
    await professionalCloseObservation({ ...BASE_INPUT, actor: GOVT_OUT_JURISDICTION }, deps);
    expect(deps.repo.insertObservationCloseAuditLog).not.toHaveBeenCalled();
  });
});
