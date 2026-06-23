/**
 * Canonical period → date-window resolver for /gob dashboard pages.
 *
 * Accepts the raw searchParams produced by <PeriodPicker> and returns a
 * `{ since: Date; until: Date }` window. The `until` is always "now" for
 * preset chips; only custom ranges may set `until` to a past date.
 *
 * Preset chip values (from PeriodPicker.tsx):
 *   "7d"          → last 7 days
 *   "30d"         → last 30 days
 *   "90d"         → last 90 days
 *   "ytd"         → Jan 1 of the current year → now
 *   "trailing12m" → last 365 days (default for admin dashboards)
 *   "custom"      → `from` / `to` ISO date strings (YYYY-MM-DD) from searchParams
 *
 * Fallback: missing, unknown, or un-parseable input → 12-month window
 * (preserves the pre-existing default behaviour for all callers).
 */

export type AnalyticsPeriod = {
  since: Date;
  until: Date;
};

export type PeriodSearchParams = {
  period?: string;
  from?: string;
  to?: string;
};

/**
 * Default preset for admin/gob dashboards that use a trailing-12m server window.
 * Shared between server pages and <PeriodPicker defaultPreset> so the chip label
 * always matches the data window on first load (C32).
 */
export const DEFAULT_DASHBOARD_PRESET = "trailing12m" as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default window: 12 months rolling. Matches the pre-existing hardcoded behaviour. */
function defaultWindow(now: number): AnalyticsPeriod {
  return { since: new Date(now - 365 * DAY_MS), until: new Date(now) };
}

/**
 * Parse a YYYY-MM-DD string to a Date at midnight UTC.
 * Returns `null` when the string is absent, malformed, or out-of-range.
 */
function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  // Accept only YYYY-MM-DD format (10 chars, no time component accepted here).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Clamp: reject dates more than 10 years in the past or any future date.
  const year = d.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  if (year < currentYear - 10 || year > currentYear + 1) return null;
  return d;
}

/**
 * Resolve `{ period?, from?, to? }` searchParams into a `{ since, until }` window.
 *
 * @param sp  - Raw searchParam values (string | undefined).
 * @param now - Optional timestamp override for deterministic testing. Defaults to Date.now().
 */
export function resolveAnalyticsPeriod(
  sp: PeriodSearchParams,
  now: number = Date.now(),
): AnalyticsPeriod {
  const until = new Date(now);

  switch (sp.period) {
    case "7d":
      return { since: new Date(now - 7 * DAY_MS), until };
    case "30d":
      return { since: new Date(now - 30 * DAY_MS), until };
    case "90d":
      return { since: new Date(now - 90 * DAY_MS), until };
    case "trailing12m":
      return { since: new Date(now - 365 * DAY_MS), until };
    case "ytd": {
      const jan1 = new Date(`${new Date(now).getUTCFullYear()}-01-01T00:00:00Z`);
      return { since: jan1, until };
    }
    case "custom": {
      const from = parseDate(sp.from);
      const to = parseDate(sp.to);
      // Both endpoints required; `from` must precede or equal `to`.
      if (from && to && from.getTime() <= to.getTime()) {
        // `until` for custom ranges is end-of-day of the `to` date.
        const toEndOfDay = new Date(to.getTime() + DAY_MS - 1);
        return { since: from, until: toEndOfDay };
      }
      // Partial or invalid custom range → default.
      return defaultWindow(now);
    }
    default:
      // Absent, unknown preset, or any other value → 12m default.
      return defaultWindow(now);
  }
}
