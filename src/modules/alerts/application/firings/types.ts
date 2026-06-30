// Result types for alert-firings use-cases.

export type FiringActionResult = { ok: true } | { error: string };

export type RecordFiringsResult = {
  /** Subscriptions evaluated. */
  evaluated: number;
  /** Subscriptions currently breaching. */
  breaching: number;
  /** New firings inserted (after dedup). */
  opened: number;
};
