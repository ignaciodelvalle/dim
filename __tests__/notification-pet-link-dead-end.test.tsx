// The "Ver {nombre}" button must not appear on a notification whose whole
// point is that the pet left the recipient (S6-F02).
//
// The bug: after a transfer, the notification telling the SENDER "la mascota ya
// no figura a tu nombre" still rendered a button to /mis-mascotas/{token}, a
// page that correctly answered "No encontramos esta página".
//
// WHY THIS IS A TYPE DENYLIST AND NOT AN OWNERSHIP CHECK — the part worth
// keeping: the first fix required a live `ownerships.ownerUserId` row for the
// reader before joining the pet. That is a different question from "can this
// person open the page". `ownerships` is polymorphic (ownerUserId XOR
// ownerOrganizationId), so an org-held pet has no personal row at all, and the
// check silently stripped the link — and the quick-reply island with it — from
// every member of the holding organisation, plus from a former owner reading
// during an open custody episode. Both are granted the page by
// requirePetAccess. The regression never shipped; this file exists so the
// reasoning is not re-derived from scratch.

import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/notifications", () => ({
  archiveNotificationAction: vi.fn(),
  markNotificationReadAction: vi.fn(),
}));

import { NotificationCard } from "@/components/NotificationCard";
import type { Notification, Pet } from "@/db";

const PET = {
  id: "pet-1",
  publicToken: "DIM-TEST-0001",
  name: "Luna",
} as unknown as Pet;

function notificationOfType(notificationType: string): Notification {
  return {
    id: "notif-1",
    userId: "user-1",
    notificationType,
    severity: "success",
    title: "Título",
    body: "Cuerpo de la notificación.",
    ctaUrl: "/mis-mascotas",
    ctaLabel: "Ver mis mascotas",
    relatedPetId: PET.id,
    category: "custody",
    createdAt: new Date("2026-08-08T12:00:00Z"),
    readAt: null,
    archivedAt: null,
  } as unknown as Notification;
}

function render(notificationType: string): string {
  return renderToStaticMarkup(
    (
      <NotificationCard notification={notificationOfType(notificationType)} relatedPet={PET} />
    ) as React.ReactElement,
  );
}

describe("NotificationCard — pet link on custody-left notifications", () => {
  for (const type of [
    "pet_transfer_accepted",
    "cross_org_transfer_accepted_sender",
    "foster_ended_by_transfer",
  ]) {
    it(`renders no pet link for ${type}`, () => {
      const html = render(type);
      expect(html).not.toContain(`/mis-mascotas/${PET.publicToken}`);
      expect(html).not.toContain("Ver Luna");
    });
  }

  it("still explains what happened — only the dead link is removed", () => {
    // Non-vacuity in the direction that matters most: suppressing the card
    // entirely would also pass the assertions above while hiding the news.
    const html = render("pet_transfer_accepted");
    expect(html).toContain("Cuerpo de la notificación.");
    expect(html).toContain("Ver mis mascotas");
  });

  it("keeps the pet link for every other type", () => {
    // The denylist must stay a denylist. A blanket removal would strip the link
    // from the org member and the sighting notification too.
    const html = render("pet_sighting_reported");
    expect(html).toContain(`/mis-mascotas/${PET.publicToken}`);
    expect(html).toContain("Ver Luna");
  });
});
