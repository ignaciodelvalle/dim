// Unit tests for organizations contact + capability use-cases (WU-4, tasks 4.2 + 4.3):
//   - submitOrgContact
//   - requestCapability
//   - decideCapability
//
// Strategy: mock repo; test pure business logic only.
// Auth is NOT in use-cases — done at the action edge.
//
// TDD: tests written before use-case files exist (RED phase).

import { describe, expect, it, vi } from "vitest";

import { decideCapability } from "@/src/modules/organizations/application/decide-capability";
import { requestCapability } from "@/src/modules/organizations/application/request-capability";
import { submitOrgContact } from "@/src/modules/organizations/application/submit-org-contact";

// ---------------------------------------------------------------------------
// submitOrgContact
// ---------------------------------------------------------------------------

describe("submitOrgContact", () => {
  const validInput = {
    orgToken: "token-abc",
    kind: "contact" as const,
    name: "Pedro",
    email: "pedro@example.com",
    message: "Hola, quiero adoptar.",
    ip: "192.168.1.1",
  };

  function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      findOrgByToken: vi.fn().mockResolvedValue({ id: "org-1" }),
      insertContact: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  const enforceRateLimit = vi.fn().mockResolvedValue(undefined);

  it("inserts contact message and returns ok", async () => {
    const repo = makeRepo();
    const result = await submitOrgContact(validInput, { repo, enforceRateLimit });
    expect(result.ok).toBe(true);
    expect(repo.insertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        kind: "contact",
        inquirerEmail: "pedro@example.com",
        message: "Hola, quiero adoptar.",
        submitterIp: "192.168.1.1",
      }),
    );
  });

  it("returns error when org not found", async () => {
    const repo = makeRepo({ findOrgByToken: vi.fn().mockResolvedValue(null) });
    const result = await submitOrgContact(validInput, { repo, enforceRateLimit });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe("Refugio no encontrado.");
  });

  it("returns error for invalid email", async () => {
    const repo = makeRepo();
    const result = await submitOrgContact(
      { ...validInput, email: "not-an-email" },
      { repo, enforceRateLimit },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "Indicá un email válido para que puedan responderte.",
    );
  });

  it("returns error for message too short", async () => {
    const repo = makeRepo();
    const result = await submitOrgContact(
      { ...validInput, message: "Hola" },
      { repo, enforceRateLimit },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "El mensaje es muy corto (mínimo 10 caracteres).",
    );
  });

  it("returns error for message too long", async () => {
    const repo = makeRepo();
    const result = await submitOrgContact(
      { ...validInput, message: "A".repeat(501) },
      { repo, enforceRateLimit },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("500");
  });

  it("stores null IP when ip is 'unknown'", async () => {
    const repo = makeRepo();
    await submitOrgContact({ ...validInput, ip: "unknown" }, { repo, enforceRateLimit });
    expect(repo.insertContact).toHaveBeenCalledWith(expect.objectContaining({ submitterIp: null }));
  });

  it("re-throws rate-limit error as user-friendly message", async () => {
    const repo = makeRepo();
    const rateLimitErr = { isRateLimit: true };
    const throwingRL = vi.fn().mockRejectedValueOnce(rateLimitErr);
    const isRateLimitError = (e: unknown): e is { isRateLimit: true } =>
      typeof e === "object" && e !== null && (e as Record<string, unknown>).isRateLimit === true;
    const result = await submitOrgContact(validInput, {
      repo,
      enforceRateLimit: throwingRL,
      isRateLimitError,
    });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toContain("Ya enviaste varios mensajes");
  });
});

// ---------------------------------------------------------------------------
// requestCapability
// ---------------------------------------------------------------------------

describe("requestCapability", () => {
  const activeOrg = {
    organization: {
      id: "org-1",
      displayName: "Refugio Test",
      publicToken: "tok-org",
    },
    membership: {
      id: "mem-1",
      role: "member",
      organizationId: "org-1",
    },
  };

  function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      insertGrant: vi.fn().mockResolvedValue(undefined),
      adminRecipients: vi.fn().mockResolvedValue([{ userId: "admin-1" }]),
      findRequesterDisplayName: vi.fn().mockResolvedValue("María García"),
      ...overrides,
    };
  }

  const txFn = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({});
  });

  const isUniqueViolation = vi.fn().mockReturnValue(false);

  it("inserts grant and fans out notifications for a valid request", async () => {
    const repo = makeRepo();
    const result = await requestCapability(
      {
        userId: "user-1",
        capability: "foster.assign",
        reason: "Necesito asignar tránsitos",
        active: activeOrg,
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(true);
    expect(repo.insertGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipId: "mem-1",
        organizationId: "org-1",
        capability: "foster.assign",
        status: "pending",
        requestedReason: "Necesito asignar tránsitos",
      }),
      expect.anything(),
    );
    expect(repo.adminRecipients).toHaveBeenCalledWith("org-1", expect.anything());
  });

  it("returns error when admin (already has all permissions)", async () => {
    const repo = makeRepo();
    const result = await requestCapability(
      {
        userId: "user-admin",
        capability: "foster.assign",
        reason: null,
        active: {
          ...activeOrg,
          membership: { ...activeOrg.membership, role: "admin" },
        },
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "Como administrador ya tenés todos los permisos.",
    );
  });

  it("returns error when vet_individual requests implicit cap", async () => {
    const repo = makeRepo();
    const result = await requestCapability(
      {
        userId: "user-vet",
        capability: "event.write", // vet implicit
        reason: null,
        active: {
          ...activeOrg,
          membership: { ...activeOrg.membership, role: "vet_individual" },
        },
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "Como veterinario/a ya tenés este permiso por defecto.",
    );
  });

  it("returns unique-violation error for duplicate open grant", async () => {
    const repo = makeRepo({ insertGrant: vi.fn().mockRejectedValue(new Error("txError")) });
    const isUniqueViolationTrue = vi.fn().mockReturnValue(true);
    const result = await requestCapability(
      {
        userId: "user-1",
        capability: "foster.assign",
        reason: null,
        active: activeOrg,
      },
      { repo, transaction: txFn, isUniqueViolation: isUniqueViolationTrue },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "Ya tenés una solicitud pendiente o un permiso concedido para esto.",
    );
  });

  it("does not notify when no admins exist", async () => {
    const repo = makeRepo({ adminRecipients: vi.fn().mockResolvedValue([]) });
    const result = await requestCapability(
      {
        userId: "user-1",
        capability: "foster.assign",
        reason: null,
        active: activeOrg,
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(true);
    expect(repo.findRequesterDisplayName).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// decideCapability
// ---------------------------------------------------------------------------

describe("decideCapability", () => {
  const activeOrg = {
    organization: {
      id: "org-1",
      displayName: "Refugio Test",
      publicToken: "tok-org",
    },
    membership: {
      id: "mem-admin",
      role: "admin",
      organizationId: "org-1",
    },
  };

  function makeGrant(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "grant-1",
      organizationId: "org-1",
      capability: "foster.assign",
      status: "pending",
      membershipId: "mem-1",
      requestedReason: null,
      decidedAt: null,
      decidedByUserId: null,
      decisionReason: null,
      ...overrides,
    };
  }

  function makeRepo(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      findGrant: vi.fn().mockResolvedValue(makeGrant()),
      updateGrant: vi.fn().mockResolvedValue(undefined),
      findGrantMemberUserId: vi.fn().mockResolvedValue("user-requester"),
      ...overrides,
    };
  }

  const txFn = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    return cb({});
  });

  const isUniqueViolation = vi.fn().mockReturnValue(false);

  it("approves a pending grant and queues notification", async () => {
    const repo = makeRepo();
    const result = await decideCapability(
      {
        deciderId: "admin-1",
        grantId: "grant-1",
        decision: "approved",
        reason: null,
        active: activeOrg,
        granted: new Set(["capability.grant"]),
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(true);
    expect(repo.updateGrant).toHaveBeenCalledWith(
      "grant-1",
      expect.objectContaining({ status: "approved" }),
      expect.anything(),
    );
  });

  it("revokes an approved grant", async () => {
    const repo = makeRepo({
      findGrant: vi.fn().mockResolvedValue(makeGrant({ status: "approved" })),
    });
    const result = await decideCapability(
      {
        deciderId: "admin-1",
        grantId: "grant-1",
        decision: "revoked",
        reason: null,
        active: activeOrg,
        granted: new Set(["capability.grant"]),
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(true);
  });

  it("returns error when grant not found", async () => {
    const repo = makeRepo({ findGrant: vi.fn().mockResolvedValue(null) });
    const result = await decideCapability(
      {
        deciderId: "admin-1",
        grantId: "grant-missing",
        decision: "approved",
        reason: null,
        active: activeOrg,
        granted: new Set(["capability.grant"]),
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe("Solicitud no encontrada.");
  });

  it("returns error when grant belongs to different org (auth scope guard)", async () => {
    const repo = makeRepo({
      findGrant: vi.fn().mockResolvedValue(makeGrant({ organizationId: "org-OTHER" })),
    });
    const result = await decideCapability(
      {
        deciderId: "admin-1",
        grantId: "grant-1",
        decision: "approved",
        reason: null,
        active: activeOrg,
        granted: new Set(["capability.grant"]),
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "Esa solicitud pertenece a otra organización.",
    );
  });

  it("returns error for terminal state (denied is terminal)", async () => {
    const repo = makeRepo({
      findGrant: vi.fn().mockResolvedValue(makeGrant({ status: "denied" })),
    });
    const result = await decideCapability(
      {
        deciderId: "admin-1",
        grantId: "grant-1",
        decision: "approved",
        reason: null,
        active: activeOrg,
        granted: new Set(["capability.grant"]),
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "La solicitud ya está en un estado terminal.",
    );
  });

  it("returns error when actor lacks capability.grant", async () => {
    const repo = makeRepo();
    const result = await decideCapability(
      {
        deciderId: "user-1",
        grantId: "grant-1",
        decision: "approved",
        reason: null,
        active: activeOrg,
        granted: new Set<string>(["foster.assign"]), // no capability.grant
      },
      { repo, transaction: txFn, isUniqueViolation },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "No tenés permiso para decidir solicitudes.",
    );
  });

  it("returns race error on unique violation during approve", async () => {
    const repo = makeRepo({
      updateGrant: vi.fn().mockRejectedValue(new Error("race")),
    });
    const isUniqueViolationTrue = vi.fn().mockReturnValue(true);
    const result = await decideCapability(
      {
        deciderId: "admin-1",
        grantId: "grant-1",
        decision: "approved",
        reason: null,
        active: activeOrg,
        granted: new Set(["capability.grant"]),
      },
      { repo, transaction: txFn, isUniqueViolation: isUniqueViolationTrue },
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toBe(
      "Otro permiso ya está activo para este miembro.",
    );
  });
});
