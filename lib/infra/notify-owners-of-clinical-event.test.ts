import { describe, expect, it, vi } from "vitest";

import {
  type ClinicalEventNotifyInput,
  notifyOwnersOfClinicalEvent,
} from "./notify-owners-of-clinical-event";

function makeInput(over: Partial<ClinicalEventNotifyInput> = {}): ClinicalEventNotifyInput {
  return {
    petId: "pet-1",
    petName: "Rocky",
    petPublicToken: "DIM-1234-5678",
    eventId: "evt-1",
    eventType: "vaccination_administered",
    authorUserId: "vet-1",
    authorLabel: "Refugio Patitas del Norte",
    ...over,
  };
}

describe("notifyOwnersOfClinicalEvent — third-party clinical signature", () => {
  it("notifies the owner when a third party signs a clinical event", async () => {
    const createNotification = vi.fn().mockResolvedValue({ status: "inserted", id: "n-1" });

    const res = await notifyOwnersOfClinicalEvent(makeInput(), {
      findOwnerUserIds: async () => ["owner-1"],
      createNotification,
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    const arg = createNotification.mock.calls[0][0];
    expect(arg.userId).toBe("owner-1");
    expect(arg.notificationType).toBe("clinical_event_recorded");
    expect(arg.category).toBe("health");
    expect(arg.title).toBe("Nuevo registro en la libreta de Rocky");
    expect(arg.body).toBe(
      "Refugio Patitas del Norte registró vacuna administrada en la libreta de Rocky.",
    );
    expect(arg.ctaUrl).toBe("/mis-mascotas/DIM-1234-5678");
    expect(arg.relatedPetId).toBe("pet-1");
    expect(arg.relatedEventId).toBe("evt-1");
    expect(arg.dedupeKey).toBe("event:evt-1:owner-1:clinical_recorded");
    expect(res.delivered).toBe(1);
  });

  it("does NOT notify a self-authored event (owner signs on their own pet)", async () => {
    const createNotification = vi.fn().mockResolvedValue({ status: "inserted" });

    const res = await notifyOwnersOfClinicalEvent(makeInput({ authorUserId: "owner-1" }), {
      findOwnerUserIds: async () => ["owner-1"],
      createNotification,
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(res.delivered).toBe(0);
  });

  it("notifies only the non-author owners on a co-owned pet", async () => {
    const createNotification = vi.fn().mockResolvedValue({ status: "inserted" });

    await notifyOwnersOfClinicalEvent(makeInput({ authorUserId: "owner-2" }), {
      findOwnerUserIds: async () => ["owner-1", "owner-2"],
      createNotification,
    });

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0].userId).toBe("owner-1");
  });

  it("does nothing when the pet has no human owner (org-held)", async () => {
    const createNotification = vi.fn();

    const res = await notifyOwnersOfClinicalEvent(makeInput(), {
      findOwnerUserIds: async () => [],
      createNotification,
    });

    expect(createNotification).not.toHaveBeenCalled();
    expect(res.delivered).toBe(0);
  });

  it("labels each clinical sibling from the shared event-label vocabulary", async () => {
    const createNotification = vi.fn().mockResolvedValue({ status: "inserted" });

    await notifyOwnersOfClinicalEvent(makeInput({ eventType: "deworming_administered" }), {
      findOwnerUserIds: async () => ["owner-1"],
      createNotification,
    });

    expect(createNotification.mock.calls[0][0].body).toBe(
      "Refugio Patitas del Norte registró antiparasitario en la libreta de Rocky.",
    );
  });

  it("is best-effort: a lookup failure never throws", async () => {
    const createNotification = vi.fn();

    const res = await notifyOwnersOfClinicalEvent(makeInput(), {
      findOwnerUserIds: async () => {
        throw new Error("db down");
      },
      createNotification,
    });

    expect(res.delivered).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
