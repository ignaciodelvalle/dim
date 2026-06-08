// Parity smoke tests for the thin actions layer (WU-4).
//
// Strategy: unit-level wiring verification. We cannot run the actual Next.js
// server actions in Vitest (no request context, no Supabase auth, no DB).
// Instead we verify that:
//   1. Each action returns a domain error when requireCapability denies.
//   2. Each action returns the use-case error when the use-case returns ok:false.
//   3. Each action returns the use-case value shape on ok:true.
//   4. Notifications flush is attempted post-tx (we assert db.insert is called).
//
// The underlying use-cases are tested exhaustively in their own test files
// (application/__tests__/*). These parity tests cover the action wiring.
//
// Mocking approach:
//   - vi.mock("@/src/modules/organizations/infrastructure/authz-resolver") — returns a fake requireCapability
//   - vi.mock("@/db") — no-op db.insert / db.transaction
//   - vi.mock("next/navigation") — redirect/revalidatePath are no-ops
//   - vi.mock("next/cache") — revalidatePath no-op
//   - Use-cases are mocked at their module path

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (hoisted — must come before any import of the tested module)
// ---------------------------------------------------------------------------

vi.mock("@/src/modules/organizations/infrastructure/authz-resolver", () => ({
  requireCapability: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) => cb({})),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  },
  notifications: {},
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    storage: { from: vi.fn() },
  }),
}));

vi.mock("@/lib/uploads", () => ({
  uploadAttachmentIfPresent: vi.fn().mockResolvedValue({
    uploadedPath: null,
    mimeType: null,
    size: null,
    error: null,
  }),
}));

vi.mock("@/lib/apply-intent", () => ({
  APPLY_INTENT_COOKIE_NAME: "apply_intent",
  APPLY_INTENT_PET_TOKEN_COOKIE_NAME: "apply_intent_pet_token",
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    delete: vi.fn(),
  }),
}));

// Use-case mocks
vi.mock("../application/set-adoption-eligibility", () => ({
  setAdoptionEligibility: vi.fn(),
}));
vi.mock("../application/set-adoption-listing-status", () => ({
  setAdoptionListingStatus: vi.fn(),
}));
vi.mock("../application/update-adoption-listing-content", () => ({
  updateAdoptionListingContent: vi.fn(),
}));
vi.mock("../application/submit-adoption-application", () => ({
  submitAdoptionApplication: vi.fn(),
}));
vi.mock("../application/review-adoption-application", () => ({
  approveAdoptionApplication: vi.fn(),
  rejectAdoptionApplication: vi.fn(),
}));
vi.mock("../application/finalize-adoption", () => ({
  finalizeAdoption: vi.fn(),
}));

vi.mock("../infrastructure/adoption-repository", () => ({
  AdoptionRepository: {},
}));

// ---------------------------------------------------------------------------
// Lazy imports (AFTER vi.mock calls)
// ---------------------------------------------------------------------------

import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockRequireCapability = requireCapability as ReturnType<typeof vi.fn>;

function makeAuth(overrides: Record<string, unknown> = {}) {
  return {
    error: null,
    user: { id: "user-1" },
    organization: {
      id: "org-1",
      publicToken: "org-tok",
      verified: true,
      displayName: "Refugio Test",
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("thin actions parity — setAdoptionEligibilityAction", () => {
  let setAdoptionEligibilityAction: (...args: any[]) => Promise<any>;
  let setAdoptionEligibilityUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    setAdoptionEligibilityAction = actions.setAdoptionEligibilityAction;
    const ucModule = await import("../application/set-adoption-eligibility");
    setAdoptionEligibilityUc = ucModule.setAdoptionEligibility as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const result = await setAdoptionEligibilityAction({
      petPublicToken: "tok-1",
      eligible: true,
    });
    expect(result).toEqual({ error: "No tenés permiso." });
    expect(setAdoptionEligibilityUc).not.toHaveBeenCalled();
  });

  it("returns use-case error on ok:false", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    setAdoptionEligibilityUc.mockResolvedValue({ ok: false, error: "Razón requerida." });
    const result = await setAdoptionEligibilityAction({
      petPublicToken: "tok-1",
      eligible: false,
    });
    expect(result).toEqual({ error: "Razón requerida." });
  });

  it("returns ok:true on success and does not expose notifications", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    setAdoptionEligibilityUc.mockResolvedValue({ ok: true, notifications: [] });
    const result = await setAdoptionEligibilityAction({
      petPublicToken: "tok-1",
      eligible: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it("passes all eligibility fields to the use-case", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    setAdoptionEligibilityUc.mockResolvedValue({ ok: true, notifications: [] });
    await setAdoptionEligibilityAction({
      petPublicToken: "tok-1",
      eligible: false,
      ineligibleReason: "recovery",
      ineligibleReasonNotes: "needs rest",
      ineligibleUntilIso: "2026-12-01T00:00:00.000Z",
    });
    expect(setAdoptionEligibilityUc).toHaveBeenCalledWith(
      expect.objectContaining({
        petPublicToken: "tok-1",
        eligible: false,
        ineligibleReason: "recovery",
        ineligibleReasonNotes: "needs rest",
        ineligibleUntilIso: "2026-12-01T00:00:00.000Z",
      }),
      expect.any(Object),
    );
  });
});

describe("thin actions parity — setAdoptionListingStatusAction", () => {
  let setAdoptionListingStatusAction: (...args: any[]) => Promise<any>;
  let setAdoptionListingStatusUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    setAdoptionListingStatusAction = actions.setAdoptionListingStatusAction;
    const ucModule = await import("../application/set-adoption-listing-status");
    setAdoptionListingStatusUc = ucModule.setAdoptionListingStatus as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const result = await setAdoptionListingStatusAction({
      petPublicToken: "tok-1",
      action: "publish",
    });
    expect(result).toEqual({ error: "No tenés permiso." });
  });

  it("returns use-case error on ok:false", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    setAdoptionListingStatusUc.mockResolvedValue({ ok: false, error: "Pet perdida." });
    const result = await setAdoptionListingStatusAction({
      petPublicToken: "tok-1",
      action: "publish",
    });
    expect(result).toEqual({ error: "Pet perdida." });
  });

  it("returns ok:true on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    setAdoptionListingStatusUc.mockResolvedValue({ ok: true, notifications: [] });
    const result = await setAdoptionListingStatusAction({
      petPublicToken: "tok-1",
      action: "unpublish",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("thin actions parity — updateAdoptionListingContentAction", () => {
  let updateAdoptionListingContentAction: (...args: any[]) => Promise<any>;
  let updateAdoptionListingContentUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    updateAdoptionListingContentAction = actions.updateAdoptionListingContentAction;
    const ucModule = await import("../application/update-adoption-listing-content");
    updateAdoptionListingContentUc = ucModule.updateAdoptionListingContent as ReturnType<
      typeof vi.fn
    >;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const result = await updateAdoptionListingContentAction({
      petPublicToken: "tok-1",
    });
    expect(result).toEqual({ error: "No tenés permiso." });
  });

  it("returns use-case error on ok:false", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    updateAdoptionListingContentUc.mockResolvedValue({ ok: false, error: "Historia muy larga." });
    const result = await updateAdoptionListingContentAction({
      petPublicToken: "tok-1",
      story: "x".repeat(6000),
    });
    expect(result).toEqual({ error: "Historia muy larga." });
  });

  it("returns ok:true on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    updateAdoptionListingContentUc.mockResolvedValue({ ok: true, notifications: [] });
    const result = await updateAdoptionListingContentAction({
      petPublicToken: "tok-1",
      story: "Buena historia",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("thin actions parity — submitAdoptionApplicationAction", () => {
  let submitAdoptionApplicationAction: (...args: any[]) => Promise<any>;
  let submitAdoptionApplicationUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    submitAdoptionApplicationAction = actions.submitAdoptionApplicationAction;
    const ucModule = await import("../application/submit-adoption-application");
    submitAdoptionApplicationUc = ucModule.submitAdoptionApplication as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns auth error when no user session", async () => {
    // The action calls the use-case with applicant=null; use-case returns auth error.
    // We mock the use-case to return the auth error (as the real one would).
    submitAdoptionApplicationUc.mockResolvedValue({
      ok: false,
      error: "Necesitás iniciar sesión para postularte.",
    });
    const result = await submitAdoptionApplicationAction({
      petPublicToken: "tok-1",
      housingType: "departamento",
      otherPets: null,
      dailyRoutine: null,
      notes: null,
      profileSharingConsent: true,
    });
    // The action calls the use-case with applicant=null; use-case returns auth error
    expect(submitAdoptionApplicationUc).toHaveBeenCalledWith(
      expect.objectContaining({ petPublicToken: "tok-1" }),
      expect.objectContaining({ applicant: null }),
    );
    expect(result).toEqual({ error: "Necesitás iniciar sesión para postularte." });
  });

  it("returns use-case error on ok:false", async () => {
    submitAdoptionApplicationUc.mockResolvedValue({ ok: false, error: "Ya postulaste." });
    const result = await submitAdoptionApplicationAction({
      petPublicToken: "tok-1",
      housingType: "departamento",
      otherPets: null,
      dailyRoutine: null,
      notes: null,
      profileSharingConsent: true,
    });
    expect(result).toEqual({ error: "Ya postulaste." });
  });

  it("returns ok+applicationEventId on success", async () => {
    submitAdoptionApplicationUc.mockResolvedValue({
      ok: true,
      value: { eventId: "evt-app-1" },
      notifications: [],
    });
    const result = await submitAdoptionApplicationAction({
      petPublicToken: "tok-1",
      housingType: "departamento",
      otherPets: null,
      dailyRoutine: null,
      notes: null,
      profileSharingConsent: true,
    });
    expect(result).toEqual({ ok: true, applicationEventId: "evt-app-1" });
  });
});

describe("thin actions parity — approveAdoptionApplicationAction", () => {
  let approveAdoptionApplicationAction: (...args: any[]) => Promise<any>;
  let approveAdoptionApplicationUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    approveAdoptionApplicationAction = actions.approveAdoptionApplicationAction;
    const ucModule = await import("../application/review-adoption-application");
    approveAdoptionApplicationUc = ucModule.approveAdoptionApplication as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const result = await approveAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ error: "No tenés permiso." });
  });

  it("returns org-token mismatch error", async () => {
    mockRequireCapability.mockResolvedValue(
      makeAuth({ organization: { ...makeAuth().organization, publicToken: "other-tok" } }),
    );
    const result = await approveAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ error: "No tenés acceso a esta organización." });
  });

  it("returns use-case error on ok:false", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    approveAdoptionApplicationUc.mockResolvedValue({ ok: false, error: "Ya resuelta." });
    const result = await approveAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ error: "Ya resuelta." });
  });

  it("returns ok:true on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    approveAdoptionApplicationUc.mockResolvedValue({ ok: true, notifications: [] });
    const result = await approveAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("thin actions parity — rejectAdoptionApplicationAction", () => {
  let rejectAdoptionApplicationAction: (...args: any[]) => Promise<any>;
  let rejectAdoptionApplicationUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    rejectAdoptionApplicationAction = actions.rejectAdoptionApplicationAction;
    const ucModule = await import("../application/review-adoption-application");
    rejectAdoptionApplicationUc = ucModule.rejectAdoptionApplication as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const result = await rejectAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ error: "No tenés permiso." });
  });

  it("returns use-case error on ok:false", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    rejectAdoptionApplicationUc.mockResolvedValue({ ok: false, error: "Pet ya adoptada." });
    const result = await rejectAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ error: "Pet ya adoptada." });
  });

  it("returns ok:true on success", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    rejectAdoptionApplicationUc.mockResolvedValue({ ok: true, notifications: [] });
    const result = await rejectAdoptionApplicationAction("org-tok", {
      applicationEventId: "evt-1",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("thin actions parity — finalizeAdoptionAction", () => {
  let finalizeAdoptionAction: (...args: any[]) => Promise<any>;
  let finalizeAdoptionUc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actions = await import("../actions");
    finalizeAdoptionAction = actions.finalizeAdoptionAction;
    const ucModule = await import("../application/finalize-adoption");
    finalizeAdoptionUc = ucModule.finalizeAdoption as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns capability error when auth fails", async () => {
    mockRequireCapability.mockResolvedValue({ error: "No tenés permiso." });
    const formData = new FormData();
    const result = await finalizeAdoptionAction("org-tok", "pet-tok", { error: null }, formData);
    expect(result).toEqual({ error: "No tenés permiso." });
    expect(finalizeAdoptionUc).not.toHaveBeenCalled();
  });

  it("returns use-case error on ok:false", async () => {
    mockRequireCapability.mockResolvedValue(makeAuth());
    finalizeAdoptionUc.mockResolvedValue({ ok: false, error: "Mascota no encontrada." });
    const formData = new FormData();
    formData.append("adopterDni", "12345678");
    formData.append("adopterDisplayName", "Juan Pérez");
    const result = await finalizeAdoptionAction("org-tok", "pet-tok", { error: null }, formData);
    expect(result).toEqual({ error: "Mascota no encontrada." });
  });

  it("flushes notifications and redirects on success", async () => {
    const { db } = await import("@/db");
    const { redirect } = await import("next/navigation");
    mockRequireCapability.mockResolvedValue(makeAuth());
    finalizeAdoptionUc.mockResolvedValue({
      ok: true,
      value: { eventId: "evt-1" },
      notifications: [{ userId: "u-1", notificationType: "adoption_finalized" }],
    });
    const formData = new FormData();
    formData.append("adopterDni", "12345678");
    formData.append("adopterDisplayName", "Juan Pérez");
    await finalizeAdoptionAction("org-tok", "pet-tok", { error: null }, formData);
    expect(db.insert).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/org/org-tok/mascotas?adopcion=pet-tok");
  });

  it("does NOT flush notifications when empty (no db.insert for empty array)", async () => {
    const { db } = await import("@/db");
    mockRequireCapability.mockResolvedValue(makeAuth());
    finalizeAdoptionUc.mockResolvedValue({
      ok: true,
      value: { eventId: "evt-1" },
      notifications: [],
    });
    const formData = new FormData();
    formData.append("adopterDni", "12345678");
    formData.append("adopterDisplayName", "Juan Pérez");
    await finalizeAdoptionAction("org-tok", "pet-tok", { error: null }, formData);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
