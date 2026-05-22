// Pure helpers for PetUpcomingCareSection — extracted so they can be
// unit-tested without a JSX transformer.

export const MAX_UPCOMING_ITEMS = 5;

export interface UpcomingCareItem {
  id: string;
  /** Source of the item — used for rendering decisions. */
  kind: "reminder" | "appointment" | "medication";
  label: string;
  dueAt: Date;
}

/**
 * Merges reminders, appointments, and medication dose items into a single
 * sorted list, capped at MAX_UPCOMING_ITEMS. Returns the sorted slice plus
 * whether more items exist beyond the cap.
 */
export function mergeUpcomingItems(
  items: UpcomingCareItem[],
): { visible: UpcomingCareItem[]; hasMore: boolean } {
  const sorted = [...items].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const visible = sorted.slice(0, MAX_UPCOMING_ITEMS);
  return { visible, hasMore: sorted.length > MAX_UPCOMING_ITEMS };
}
