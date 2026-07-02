import type { GovtBusinessRuleType } from "@/db";

export type BusinessRuleFormState = {
  error: string | null;
  warning?: string;
  /**
   * Set on success instead of the action calling next/navigation's
   * redirect(). Next.js 15.5.x's App Router can silently drop a server
   * action's own redirect() transition in production (engram #621/#622,
   * verify-report #650 WARNING-1) — the mutation commits (confirmed via
   * audit_log) but the client never navigates and the submit button stays
   * stuck pending. The calling form does a real `window.location.assign`
   * full document navigation to this URL instead (see
   * lib/ui/full-page-action-nav.ts) — the one mechanism proven immune to
   * the router-drop defect.
   */
  redirectTo?: string;
};

export type CreateBusinessRuleWriterParams = {
  actorUserId: string;
  ruleType: GovtBusinessRuleType;
  jurisdictionCountry: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  rulePayload: unknown;
  notes: string | null;
  legalAnchorIds: string[];
};

export type CreateBusinessRuleResult =
  | { ok: true; ruleId: string; noOp?: false }
  | { ok: true; ruleId: null; noOp: true; reason: string }
  | { ok: false; error: string };

export type UpdateBusinessRuleWriterParams = {
  actorUserId: string;
  ruleId: string;
  rulePayload: unknown;
  notes: string | null;
  legalAnchorIds: string[];
};

export type DeleteBusinessRuleWriterParams = {
  actorUserId: string;
  ruleId: string;
  /** Operator-supplied reason for the deletion — recorded in the audit payload. */
  reason: string;
};
