// Types for the reminders use-cases (strangler migration 42/61).

export type ReminderFormState = {
  error: string | null;
};

// ---------------------------------------------------------------------------
// snoozeReminderAction — posponer un recordatorio (spec §E)
// ---------------------------------------------------------------------------
// Snooze cap: 3 × 7 days, then a single 30-day snooze (no further increment).
//   snooze_count < 3  → snoozed_until = now + 7d, snooze_count++
//   snooze_count >= 3 → snoozed_until = now + 30d, snooze_count stays at 3

export type SnoozeReminderResult =
  | { ok: true; snoozedUntil: string; snoozeCount: number }
  | { ok: false; error: string };
