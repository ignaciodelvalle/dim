// Pure heuristics for auto-flagging suspicious anonymous welfare reports.
// Runs after the row is inserted; the caller updates `flagged_at` and
// `flag_reasons` when this returns a non-empty array.
//
// Rules apply ONLY to anonymous submissions (reporter_user_id IS NULL).
// Authenticated reporters skip every rule — identity is the strong signal.
//
// Reason codes are stable strings so they can be aggregated in admin
// metrics and matched against in tests. Adding a new rule = appending
// a new code; never repurpose an existing one.

import { and, eq, gte, isNull, ne } from "drizzle-orm";

import { db, welfareReports } from "@/db";

export const FLAG_REASONS = [
  "trivial_description",
  "critical_without_evidence",
  "duplicate_within_24h",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type ModerationInput = {
  // The id of the row that was just inserted — excluded from the
  // duplicate-within-24h lookup so we don't match against ourselves.
  reportId: string;
  description: string;
  severity: string;
  subjectKind: string;
  attachmentCount: number;
};

export async function computeFlagReasons(input: ModerationInput): Promise<FlagReason[]> {
  const reasons: FlagReason[] = [];

  // Rule 1 — trivial description.
  // The form already enforces description ≥ 20 chars at validation time, so
  // anything below 30 here is borderline. We also flag descriptions that are
  // mostly all-caps (>70% of the alphabetic characters), since legitimate
  // denuncias tend to be conversational, not shouting matches.
  const trimmed = input.description.trim();
  const letters = trimmed.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  const uppers = letters.replace(/[a-záéíóúñ]/g, "");
  const isAllCaps = letters.length >= 10 && uppers.length / letters.length > 0.7;
  if (trimmed.length < 30 || isAllCaps) {
    reasons.push("trivial_description");
  }

  // Rule 2 — severity=critical with no evidence and no concrete subject.
  // The combination "the worst thing ever, somewhere general, no proof" is
  // the canonical troll pattern. A real critical case usually attaches
  // photos or names a specific animal.
  if (
    input.severity === "critical" &&
    input.subjectKind === "general" &&
    input.attachmentCount === 0
  ) {
    reasons.push("critical_without_evidence");
  }

  // Rule 3 — exact duplicate description from another anonymous reporter
  // within the last 24 hours. The rate limiter already caps per-IP volume;
  // this catches "same complaint copy-pasted from multiple IPs". We can't
  // do a true per-IP check until we add a reporter_ip column; in the
  // meantime, description+anonymity is a strong-enough signal that a
  // false positive only costs one admin review.
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
  const [duplicate] = await db
    .select({ id: welfareReports.id })
    .from(welfareReports)
    .where(
      and(
        ne(welfareReports.id, input.reportId),
        eq(welfareReports.description, trimmed),
        gte(welfareReports.createdAt, since),
        isNull(welfareReports.reporterUserId),
      ),
    )
    .limit(1);
  if (duplicate) {
    reasons.push("duplicate_within_24h");
  }

  return reasons;
}

export function reasonLabel(reason: FlagReason | string): string {
  switch (reason) {
    case "trivial_description":
      return "Descripción muy corta o en mayúsculas";
    case "critical_without_evidence":
      return "Crítica sin sujeto concreto ni evidencia";
    case "duplicate_within_24h":
      return "Duplicada en las últimas 24h";
    default:
      return reason;
  }
}
