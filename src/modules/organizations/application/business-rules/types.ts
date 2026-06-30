import type { GovtBusinessRuleType } from "@/db";

export type BusinessRuleFormState = {
  error: string | null;
  warning?: string;
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
