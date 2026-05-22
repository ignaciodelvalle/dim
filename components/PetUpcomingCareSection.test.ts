// Unit tests for PetUpcomingCareSection — mergeUpcomingItems helper.
//
// Tests the pure consolidation logic: sorting by dueAt ASC, 5-item cap,
// and the hasMore flag that triggers "Ver todos →".

import { describe, expect, it } from "vitest";
import {
  MAX_UPCOMING_ITEMS,
  type UpcomingCareItem,
  mergeUpcomingItems,
} from "./PetUpcomingCareSection.helpers";

function makeItem(
  kind: UpcomingCareItem["kind"],
  dueAt: Date,
  id = `${kind}-${Math.random().toString(36).slice(2)}`,
): UpcomingCareItem {
  return { id, kind, label: `${kind} item`, dueAt };
}

describe("mergeUpcomingItems", () => {
  it("returns an empty list when no items provided", () => {
    const { visible, hasMore } = mergeUpcomingItems([]);
    expect(visible).toHaveLength(0);
    expect(hasMore).toBe(false);
  });

  it("sorts items by dueAt ascending (AC-A10)", () => {
    const items = [
      makeItem("appointment", new Date("2024-06-15")),
      makeItem("reminder", new Date("2024-05-01")),
      makeItem("medication", new Date("2024-07-20")),
    ];
    const { visible } = mergeUpcomingItems(items);
    expect(visible[0].dueAt).toEqual(new Date("2024-05-01"));
    expect(visible[1].dueAt).toEqual(new Date("2024-06-15"));
    expect(visible[2].dueAt).toEqual(new Date("2024-07-20"));
  });

  it("items from all three sources appear in the merged list", () => {
    const items = [
      makeItem("reminder", new Date("2024-05-01")),
      makeItem("appointment", new Date("2024-05-02")),
      makeItem("medication", new Date("2024-05-03")),
    ];
    const { visible } = mergeUpcomingItems(items);
    const kinds = visible.map((i) => i.kind);
    expect(kinds).toContain("reminder");
    expect(kinds).toContain("appointment");
    expect(kinds).toContain("medication");
  });

  it("shows at most 5 items (AC-A10)", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeItem("reminder", new Date(`2024-0${(i % 9) + 1}-01`)),
    );
    const { visible } = mergeUpcomingItems(items);
    expect(visible.length).toBeLessThanOrEqual(MAX_UPCOMING_ITEMS);
    expect(visible).toHaveLength(5);
  });

  it("hasMore is false when 5 or fewer items (AC-A10)", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem("reminder", new Date(`2024-0${i + 1}-01`)),
    );
    const { hasMore } = mergeUpcomingItems(items);
    expect(hasMore).toBe(false);
  });

  it("hasMore is true when more than 5 items — triggers 'Ver todos →' (AC-A10)", () => {
    const items = Array.from({ length: 6 }, (_, i) =>
      makeItem("reminder", new Date(`2024-0${i + 1}-01`)),
    );
    const { hasMore } = mergeUpcomingItems(items);
    expect(hasMore).toBe(true);
  });

  it("items sorted ascending so earliest dueAt appears first", () => {
    const d1 = new Date("2024-01-01");
    const d2 = new Date("2024-12-31");
    const items = [makeItem("appointment", d2), makeItem("reminder", d1)];
    const { visible } = mergeUpcomingItems(items);
    expect(visible[0].dueAt).toEqual(d1);
    expect(visible[1].dueAt).toEqual(d2);
  });
});
