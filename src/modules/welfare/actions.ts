"use server";

// Thin action controllers for the welfare domain — WU-2 + WU-3 actions.
//
// Each action:
//   1. AUTH GUARD at the edge (EXACT scope per action — see spec §AUTH SCOPE).
//   2. Parse/validate raw input.
//   3. Build deps (repo, actor, closeCase, transaction) and call the use-case.
//   4. Handle UseCaseResult — on error, return the error string.
//   5. Flush pendingNotifications post-tx best-effort.
//   6. revalidatePath or return result.
//
// AUTH SCOPE CONTRACT (CRITICAL — foster cross-org bypass lesson):
//   public create (anon+auth): no gate; anon rate-limited at edge (welfare_anon bucket)
//   org create: requireUserOrRedirect + org-membership+verified+role gate scoped to orgToken
//   triage / start / close / assign / unassign / mpf-export:
//       requireAdminOrGovtOrRedirect() — govt scoped to jurisdiction in use-case
//   moderation (pass / confirm):
//       requireAdminOrRedirect() — ADMIN ONLY. Govt cannot moderate.
//
// NO business logic. NO direct Drizzle imports beyond shared db for notifications.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  db,
  type notifications,
  organizationMemberships,
  organizations,
  welfareReports,
} from "@/db";
import {
  createSignedExportUrl,
  generateWelfareMpfPdf,
  uploadExportToStorage,
  welfareReportToMpfDto,
} from "@/lib/analytics/welfare-exports";
import { signalWelfareReport } from "@/lib/domain/authority";
import { writePoint } from "@/lib/domain/location";
import {
  CoordError,
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/domain/location-normalize";
import { parseLocationFromFormData } from "@/lib/domain/location-value";
import { findAuthoritiesForJurisdiction } from "@/lib/infra/approval-routing";
import {
  requireAdminOrGovtOrRedirect,
  requireAdminOrRedirect,
  requireDenunciaModerationPrincipal,
  requireUserOrRedirect,
} from "@/lib/infra/auth-guards";
import { resolveBusinessRule } from "@/lib/infra/business-rules-resolver";
import { closeCase, openCase } from "@/lib/infra/case-helpers";
import { mintFreshReporterSession } from "@/lib/infra/denuncia-reporter-token";
import { resolveRoutableJurisdiction } from "@/lib/infra/jurisdiction-from-text";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { welfareAttachmentSignedUrl } from "@/lib/infra/storage";
import { computeFlagReasons } from "@/lib/infra/welfare-moderation";
import { removeWelfareEvidence, uploadWelfareEvidence } from "@/lib/infra/welfare-uploads";
import { createClient } from "@/lib/supabase/server";
import { parseDateInput } from "@/lib/utils/format";
import { canReceiveDerivedWelfare } from "@/src/modules/welfare/domain/derivation-eligibility";
import { generateReferenceCode } from "@/src/modules/welfare/domain/reference-code";
import { and, eq, isNull } from "drizzle-orm";

import { addInterventionNote } from "./application/add-intervention-note";
import { addReporterComment } from "./application/add-reporter-comment";
import { assignWelfare } from "./application/assign-welfare";
import { closeWelfareReport } from "./application/close-welfare-report";
import { confirmWelfareAsSpam } from "./application/confirm-welfare-as-spam";
import { createOrgWelfareReport } from "./application/create-org-welfare-report";
import { createWelfareReport } from "./application/create-welfare-report";
import { escalateModerationToAdmin } from "./application/escalate-moderation-to-admin";
import { generateMpfExport } from "./application/generate-mpf-export";
import { passWelfareToTriage } from "./application/pass-welfare-to-triage";
import {
  loadAndVerifyScope as loadAndVerifyScopeFor,
  loadInScopeReport as loadInScopeReportFor,
} from "./application/report-scope-guards";
import { returnDerivedReport } from "./application/return-derived-report";
import { startWelfareReport } from "./application/start-welfare-report";
import { takeDerivedReport } from "./application/take-derived-report";
import { triageWelfareReport } from "./application/triage-welfare-report";
import { unassignWelfare } from "./application/unassign-welfare";
import { WelfareRepository } from "./infrastructure/welfare-repository";

// ---------------------------------------------------------------------------
// Re-export types that existing consumers import from the old action files.
// (kept here so strangler shims can re-export without duplication)
// ---------------------------------------------------------------------------

export type { TriageDecision } from "./application/triage-welfare-report";
// N3 (lib/ui/full-page-action-nav.ts): the action RETURNS its destination and
// the form navigates. A dropped navigation here is a FILED denuncia with no
// receipt shown, so this is never redirect().
export type WelfareReportFormState = { error: string | null; redirectTo?: string | null };
export type TriageResult = { ok: true } | { error: string };
export type ModerationResult = { ok: true } | { error: string };
export type AssignResult = { ok: true } | { ok: false; error: string };
export type GenerateMpfExportResult =
  | { ok: true; signedUrl: string; expiresAt: Date }
  | { ok: false; error: string };

// getActiveGovtScopeForUser is a server-only query helper, NOT a server action.
// Import it directly from "./application/get-active-govt-scope" — a "use server"
// file may only export locally-declared async actions.

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const repo = new WelfareRepository();

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(
  pending: Array<{
    userId: string;
    notificationType: string;
    title: string;
    body: string;
    severity: "info" | "success" | "warning" | "urgent";
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    category?: string | null;
  }>,
): Promise<void> {
  if (pending.length === 0) return;
  try {
    await repo.insertNotifications(pending as (typeof notifications.$inferInsert)[]);
    // Web Push leg — urgent-only filtering happens inside the seam;
    // best-effort, never throws into the action path.
    const { sendPushForNotifications } = await import("@/lib/infra/web-push");
    await sendPushForNotifications(pending);
  } catch (e) {
    console.error("[welfare/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// triageWelfareReportAction — R3
// ---------------------------------------------------------------------------

export async function triageWelfareReportAction(input: {
  welfareReportId: string;
  decision: "triaged" | "invalid" | "duplicate";
  notes: string;
}): Promise<TriageResult> {
  const session = await requireAdminOrGovtOrRedirect();

  // Jurisdiction scope is enforced inside the action via a pre-load.
  // The use-case receives a trusted actor — jurisdiction check happens here.
  const loaded = await loadInScopeReportFor(
    repo,
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;

  const result = await triageWelfareReport(input, {
    repo,
    closeCase: async (args, tx) => {
      await closeCase(args, tx as Parameters<typeof closeCase>[1]);
    },
    transaction: db.transaction.bind(db),
    actor: { user: session.user, profile: session.profile },
  });

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath("/gob/denuncias");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// startWelfareReportAction — R3
// ---------------------------------------------------------------------------

export async function startWelfareReportAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<TriageResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadInScopeReportFor(
    repo,
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;

  const result = await startWelfareReport(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user: session.user, profile: session.profile },
  });

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath("/gob/denuncias");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// closeWelfareReportAction — R3
// ---------------------------------------------------------------------------

export async function closeWelfareReportAction(input: {
  welfareReportId: string;
  resolutionNotes: string;
}): Promise<TriageResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadInScopeReportFor(
    repo,
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;

  const result = await closeWelfareReport(input, {
    repo,
    closeCase: async (args, tx) => {
      await closeCase(args, tx as Parameters<typeof closeCase>[1]);
    },
    transaction: db.transaction.bind(db),
    actor: { user: session.user, profile: session.profile },
  });

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath("/gob/denuncias");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// passWelfareToTriageAction — R4 (admin-ONLY)
// ---------------------------------------------------------------------------

export async function passWelfareToTriageAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const { user } = await requireAdminOrRedirect();

  const result = await passWelfareToTriage(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/moderacion");
  revalidatePath("/gob/denuncias");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// confirmWelfareAsSpamAction — R4 (admin-ONLY)
// ---------------------------------------------------------------------------

export async function confirmWelfareAsSpamAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const { user } = await requireAdminOrRedirect();

  const result = await confirmWelfareAsSpam(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/moderacion");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Jurisdiction denuncia moderation (govt-scoped) — SDD phase 2
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: requireDenunciaModerationPrincipal ('denuncia.moderate') THEN a
// per-report jurisdiction check via loadInScopeReport:
//   admin → universal scope (no per-row check)
//   govt  → the report's jurisdiction MUST be in the account's assignments
//           (Wave A/F hardening — never widen beyond assignments). A flagged
//           report with no jurisdiction is never in a govt's scope → admin-only.
//
// These are the govt-facing counterparts of the admin-only pass/confirm actions.
// They REUSE the same use-cases (passWelfareToTriage / confirmWelfareAsSpam) —
// no forked writer — and add the jurisdiction scope guard the admin path does
// not need. The admin-only actions above are untouched (no regression).
//
//   approve  → pass to triage (unflag; the welfare case proceeds in /gob/maltrato)
//   reject   → confirm as abuse/spam (status=invalid, permanent)
//   escalate → hand back to the national admin queue with a motivo (append-only)

export async function approveDenunciaModerationAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const session = await requireDenunciaModerationPrincipal();

  const loaded = await loadInScopeReportFor(
    repo,
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return { error: loaded.error };
  // Once escalated to admin, the report leaves the govt actionable queue and is
  // the national admin's to resolve. A govt resolving it here would silently
  // clear moderationResolvedAt and drop it from the admin queue, defeating the
  // escalation/oversight. Admin-only pass/confirm stay unguarded on purpose.
  if (loaded.row.moderationEscalatedAt != null) {
    return { error: "Esta denuncia fue escalada a la administración nacional." };
  }

  const result = await passWelfareToTriage(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user: session.user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/gob/denuncias");
  revalidatePath("/admin/moderacion");
  return { ok: true };
}

export async function rejectDenunciaAsAbuseAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const session = await requireDenunciaModerationPrincipal();

  const loaded = await loadInScopeReportFor(
    repo,
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return { error: loaded.error };
  // Escalated reports are the national admin's to resolve — see approve action.
  if (loaded.row.moderationEscalatedAt != null) {
    return { error: "Esta denuncia fue escalada a la administración nacional." };
  }

  const result = await confirmWelfareAsSpam(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user: session.user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/gob/denuncias");
  revalidatePath("/admin/moderacion");
  return { ok: true };
}

export async function escalateDenunciaToAdminAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const session = await requireDenunciaModerationPrincipal();

  const loaded = await loadInScopeReportFor(
    repo,
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return { error: loaded.error };

  const result = await escalateModerationToAdmin(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user: session.user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/gob/denuncias");
  revalidatePath("/admin/moderacion");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// assignWelfareToMeAction — R5
// ---------------------------------------------------------------------------

export async function assignWelfareToMeAction(reportId: string): Promise<AssignResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadAndVerifyScopeFor(
    repo,
    reportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result = await assignWelfare(
    { welfareReportId: reportId },
    { repo, actor: { user: session.user, profile: session.profile } },
  );

  if (!result.ok) return result;

  revalidatePath("/gob/denuncias");
  revalidatePath(`/gob/maltrato/${reportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// unassignWelfareAction — R5
// ---------------------------------------------------------------------------

export async function unassignWelfareAction(reportId: string): Promise<AssignResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadAndVerifyScopeFor(
    repo,
    reportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result = await unassignWelfare(
    { welfareReportId: reportId },
    { repo, actor: { user: session.user, profile: session.profile } },
  );

  if (!result.ok) return result;

  revalidatePath("/gob/denuncias");
  revalidatePath(`/gob/maltrato/${reportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// deriveWelfareToOrgAction — R7
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: requireAdminOrGovtOrRedirect + jurisdiction scope (mirrors triage).
// Forwards a non-terminal welfare report to a verified shelter / rescue_network
// for follow-up. Sets derived_to_organization_id / derived_at / derived_by_user_id,
// notifies active org members (cap 10), writes an audit_log entry.
//
// Idempotent: re-deriving overwrites the previous derivation target. Known
// limitation: the previous org is NOT de-notified — its members keep a stale
// notification whose report no longer appears in their inbox.
// Rejected for terminal statuses (closed / invalid / duplicate).

export type DeriveWelfareToOrgResult = { ok: true } | { ok: false; error: string };

export async function deriveWelfareToOrgAction(input: {
  welfareReportId: string;
  targetOrgId: string;
}): Promise<DeriveWelfareToOrgResult> {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const loaded = await loadAndVerifyScopeFor(repo, input.welfareReportId, profile, jurisdictions);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const report = loaded.row;

  // Guard: terminal reports cannot be derived.
  if (report.status === "closed" || report.status === "invalid" || report.status === "duplicate") {
    return { ok: false, error: "No se puede derivar una denuncia cerrada o inválida." };
  }

  // Verify the target org exists, is verified, and is an eligible derivation
  // recipient (shelter / rescue_network / sanitary_authority — #48).
  const [targetOrg] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      publicToken: organizations.publicToken,
      verified: organizations.verified,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, input.targetOrgId))
    .limit(1);

  if (!targetOrg) return { ok: false, error: "Organización no encontrada." };
  if (!targetOrg.verified) return { ok: false, error: "La organización no está verificada." };
  if (!canReceiveDerivedWelfare(targetOrg.orgType)) {
    return {
      ok: false,
      error:
        "Solo se puede derivar a refugios, redes de rescate o autoridades sanitarias verificadas.",
    };
  }

  // Capture the previous derivation target BEFORE overwriting, so we can send a
  // corrective notice when re-deriving to a different org (UI-7 B8). True
  // notification retraction isn't possible — the corrective notice is the fix.
  const previousOrgId = report.derivedToOrganizationId;

  // Persist derivation fields. Re-deriving resets any prior org intervention
  // state so the new org starts from a clean slate ('tomado'/'devuelto' cleared).
  await db
    .update(welfareReports)
    .set({
      derivedToOrganizationId: targetOrg.id,
      derivedAt: new Date(),
      derivedByUserId: user.id,
      orgInterventionStatus: null,
      orgInterventionAt: null,
    })
    .where(eq(welfareReports.id, input.welfareReportId));

  // Audit log — same pattern as create-org-welfare-report.
  await repo.insertAudit({
    actorUserId: user.id,
    action: "welfare_report_derived_to_org",
    targetOrganizationId: targetOrg.id,
    payload: {
      welfareReportId: input.welfareReportId,
      referenceCode: report.referenceCode,
      targetOrgId: targetOrg.id,
      targetOrgDisplayName: targetOrg.displayName,
    },
  });

  // Notify active org members (cap 10) — use publicToken in ctaUrl (NEVER UUID).
  const memberRows = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, targetOrg.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(10);

  const ctaUrl = `/org/${targetOrg.publicToken}/maltrato/recibidos?tab=recibidos`;
  const pendingNotifications: Parameters<typeof flushNotifications>[0] = memberRows.map((m) => ({
    userId: m.userId,
    notificationType: "welfare_report_derived_to_org",
    title: "Nueva derivación de denuncia",
    body: `El gobierno derivó la denuncia ${report.referenceCode} a tu organización para seguimiento.`,
    severity: "warning" as const,
    ctaLabel: "Ver denuncia",
    ctaUrl,
    category: "welfare",
  }));

  // Re-derivation de-notify (UI-7 B8): when the report was previously derived to
  // a DIFFERENT org, notify that org's active members that they are no longer
  // responsible. Corrective notice (info) with a CTA to their recibidos list.
  if (previousOrgId && previousOrgId !== targetOrg.id) {
    const [previousOrg] = await db
      .select({ publicToken: organizations.publicToken })
      .from(organizations)
      .where(eq(organizations.id, previousOrgId))
      .limit(1);

    const previousMemberRows = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, previousOrgId),
          isNull(organizationMemberships.leftAt),
        ),
      )
      .limit(10);

    const previousCtaUrl = previousOrg
      ? `/org/${previousOrg.publicToken}/maltrato/recibidos?tab=recibidos`
      : null;

    for (const m of previousMemberRows) {
      pendingNotifications.push({
        userId: m.userId,
        notificationType: "welfare_report_rederived_away",
        title: "Derivación reasignada",
        body: `El gobierno reasignó la denuncia ${report.referenceCode} a otra organización. Tu organización ya no es responsable de su seguimiento.`,
        severity: "info",
        // CTA only when the previous org still resolves — a label without a
        // destination violates the notification CTA contract.
        ctaLabel: previousCtaUrl ? "Ver mis recibidos" : null,
        ctaUrl: previousCtaUrl,
        category: "welfare",
      });
    }
  }

  await flushNotifications(pendingNotifications);

  revalidatePath("/gob/denuncias");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  revalidatePath(`/org/${targetOrg.publicToken}/maltrato/recibidos`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Org intervention actions (UI-7) — take / note / return a derived report
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: requireUserOrRedirect THEN org-membership gate scoped to the
// org's publicToken, requiring an active membership with a case-handling role.
// No welfare case-handling capability exists in ORGANIZATION_CAPABILITIES, so
// these mutating actions gate on coordinator/admin (the privileged operative
// roles) — consistent with the gov-side actors being the only closers and with
// derivation being an institutional-grade workflow.
//
// GOV stays the ONLY closer. None of these actions touch the welfare status
// enum; they only set org_intervention_status / case_events notes.

// Roles allowed to ACT on (not just view) a derived report.
const ORG_INTERVENTION_ROLES = new Set(["admin", "coordinator"]);

export type OrgInterventionResult = { ok: true } | { ok: false; error: string };

type OrgInterventionActor = {
  userId: string;
  orgId: string;
  orgDisplayName: string;
  orgPublicToken: string;
};

/**
 * Org-membership gate for intervention actions, scoped to a publicToken.
 * Returns the resolved actor or a Spanish error string. SCOPED TO THIS ORG ONLY
 * (foster cross-org bypass lesson) — membership is matched by publicToken.
 */
async function requireOrgInterventionAccess(
  orgToken: string,
): Promise<OrgInterventionActor | { error: string }> {
  const { user } = await requireUserOrRedirect();

  const [orgRow] = await db
    .select({
      orgId: organizations.id,
      orgDisplayName: organizations.displayName,
      orgPublicToken: organizations.publicToken,
      orgVerified: organizations.verified,
      orgType: organizations.orgType,
      memberRole: organizationMemberships.role,
    })
    .from(organizations)
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.publicToken, orgToken),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!orgRow) return { error: "No sos miembro activo de esta organización." };
  if (!orgRow.orgVerified)
    return { error: "Tu organización todavía no está verificada por miMAR." };
  // Defense-in-depth: derivation targets are restricted to eligible recipients
  // in deriveWelfareToOrgAction; mirror that exact constraint here (shared
  // canReceiveDerivedWelfare rule) so a data-integrity drift can never widen the
  // intervention surface, and so an eligible sanitary_authority (#48) can act.
  if (!canReceiveDerivedWelfare(orgRow.orgType)) {
    return {
      error:
        "Solo refugios, redes de rescate y autoridades sanitarias pueden intervenir denuncias derivadas.",
    };
  }
  if (!ORG_INTERVENTION_ROLES.has(orgRow.memberRole)) {
    return {
      error:
        "Tu rol no habilita intervenir denuncias derivadas. Pediselo a un coordinador o administrador.",
    };
  }

  return {
    userId: user.id,
    orgId: orgRow.orgId,
    orgDisplayName: orgRow.orgDisplayName,
    orgPublicToken: orgRow.orgPublicToken,
  };
}

/**
 * Resolve gov recipients for an intervention notification: the deriving user
 * (if known) plus the jurisdiction authorities. Returns distinct user IDs.
 */
async function findGovInterventionRecipients(input: {
  derivedByUserId: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
}): Promise<string[]> {
  const ids = new Set<string>();
  if (input.derivedByUserId) ids.add(input.derivedByUserId);
  // Null jurisdiction coerced, not skipped (2026-08-17) — see approval-routing.ts.
  const authorities = await findAuthoritiesForJurisdiction(
    { province: input.jurisdictionProvince ?? "", locality: input.jurisdictionLocality ?? "" },
    { route: "welfare_org_intervention" },
  );
  for (const id of authorities) ids.add(id);
  return [...ids];
}

export async function takeDerivedReportAction(input: {
  orgToken: string;
  welfareReportId: string;
}): Promise<OrgInterventionResult> {
  const access = await requireOrgInterventionAccess(input.orgToken);
  if ("error" in access) return { ok: false, error: access.error };

  const result = await takeDerivedReport(
    { welfareReportId: input.welfareReportId },
    {
      repo: {
        findById: repo.findById.bind(repo),
        setOrgIntervention: repo.setOrgIntervention.bind(repo),
        insertCaseEvent: (v) => repo.insertCaseEvent(v),
      },
      findGovRecipients: findGovInterventionRecipients,
      actor: { userId: access.userId, orgId: access.orgId, orgDisplayName: access.orgDisplayName },
    },
  );

  if (!result.ok) return { ok: false, error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${access.orgPublicToken}/maltrato/recibidos`);
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

export async function addInterventionNoteAction(input: {
  orgToken: string;
  welfareReportId: string;
  text: string;
}): Promise<OrgInterventionResult> {
  const access = await requireOrgInterventionAccess(input.orgToken);
  if ("error" in access) return { ok: false, error: access.error };

  const result = await addInterventionNote(
    { welfareReportId: input.welfareReportId, text: input.text },
    {
      repo: {
        findById: repo.findById.bind(repo),
        insertCaseEvent: (v) => repo.insertCaseEvent(v),
      },
      findGovRecipients: findGovInterventionRecipients,
      actor: { userId: access.userId, orgId: access.orgId, orgDisplayName: access.orgDisplayName },
    },
  );

  if (!result.ok) return { ok: false, error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${access.orgPublicToken}/maltrato/recibidos`);
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

export async function returnDerivedReportAction(input: {
  orgToken: string;
  welfareReportId: string;
  reason: string;
}): Promise<OrgInterventionResult> {
  const access = await requireOrgInterventionAccess(input.orgToken);
  if ("error" in access) return { ok: false, error: access.error };

  const result = await returnDerivedReport(
    { welfareReportId: input.welfareReportId, reason: input.reason },
    {
      repo: {
        findById: repo.findById.bind(repo),
        returnDerivation: repo.returnDerivation.bind(repo),
        insertCaseEvent: (v) => repo.insertCaseEvent(v),
      },
      findGovRecipients: findGovInterventionRecipients,
      actor: { userId: access.userId, orgId: access.orgId, orgDisplayName: access.orgDisplayName },
    },
  );

  if (!result.ok) return { ok: false, error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath(`/org/${access.orgPublicToken}/maltrato/recibidos`);
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// generateMpfExportAction — R6
// ---------------------------------------------------------------------------

export async function generateMpfExportAction(
  welfareReportId: string,
): Promise<GenerateMpfExportResult> {
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();

  // Jurisdiction scope guard (mirrors the detail page).
  const loaded = await loadAndVerifyScopeFor(repo, welfareReportId, profile, jurisdictions);
  if ("error" in loaded) return { ok: false, error: "not_found" };

  // Lote A2 — triage gate (server-side mirror of MpfExportGate.tsx): a formal
  // Ley 14.346 fiscal document must not be generated for an untriaged report.
  // The client gate only disabled a button; a direct call bypassed it.
  if (loaded.row.status === "open") {
    return { ok: false, error: "untriaged" };
  }

  // MPF export format cascade (jurisdiction-compliance, 2026-07-22) —
  // replaces the old CABA-only gate (MPF_CONFIGURED_PROVINCES /
  // isMpfConfiguredForProvince, removed). The export is no longer blocked by
  // jurisdiction: EVERY jurisdiction can generate it. What varies per
  // jurisdiction is the FORMAT, resolved via the same locality > province >
  // country > national-default cascade every other govt_business_rules type
  // uses. With zero override rows (the common case today) this always
  // resolves { format: "estandar_nacional", source: "default" } — exactly the
  // PDF every jurisdiction already got, minus the gate that used to block
  // non-CABA reports from generating it at all.
  const mpfFormatResolved = await resolveBusinessRule("mpf_export_format", {
    country: "AR",
    province: loaded.row.jurisdictionProvince,
    locality: loaded.row.jurisdictionLocality,
  });

  const result = await generateMpfExport(
    {
      welfareReportId,
      mpfExportFormat: mpfFormatResolved.payload.format,
      mpfExportFormatSource: mpfFormatResolved.source,
    },
    {
      repo,
      generatePdf: async (dto) => {
        // The DTO built by the use-case uses raw enum values for kindLabel/severityLabel.
        // Wire through the real mapper for production so labels are human-readable.
        const report = loaded.row;
        const [reporterDisplayName, exportedByDisplayName, subjectPet, attachmentRows] =
          await Promise.all([
            repo.findReporterName(report.reporterUserId),
            repo.findExporterName(user.id),
            repo.findSubjectPet(report.subjectPetId),
            repo.findAttachments(welfareReportId),
          ]);
        const attachments = await Promise.all(
          attachmentRows.map(async (a) => ({
            filename: a.originalFilename ?? a.storagePath.split("/").pop() ?? "adjunto",
            signedUrl: await welfareAttachmentSignedUrl(a.storagePath, 7 * 24 * 60 * 60),
          })),
        );
        const exportGeneratedAt = new Date(dto.exportGeneratedAt);
        const properDto = welfareReportToMpfDto(report, {
          reporterDisplayName,
          exportedByDisplayName,
          subjectPet,
          attachments,
          exportGeneratedAt,
          mpfFormat: mpfFormatResolved.payload.format,
          mpfFormatSource: mpfFormatResolved.source,
        });
        return generateWelfareMpfPdf(properDto);
      },
      // Storage runs as service role (migration 0172): the export buckets have
      // no authenticated policy to enumerate them through. The caller was
      // already authorized above by requireAdminOrGovtOrRedirect +
      // loadAndVerifyScopeFor.
      createSignedUrl: (bucket, path, expiresIn) =>
        createSignedExportUrl(bucket as "welfare-exports", path, expiresIn),
      upload: (bucket, path, bytes) =>
        uploadExportToStorage(bucket as "welfare-exports", path, bytes),
      actor: { user },
    },
  );

  return result;
}

// ---------------------------------------------------------------------------
// createWelfareReportAction — R1 (public: anon + auth)
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: none for anon (reporter_user_id=null); authenticated user attached
// if logged in. Edge rate-limit for anon only (bucket: welfare_anon, 1/min + 3/hr).
// Authenticated users SKIP rate-limit entirely.
//
// File upload happens BEFORE the tx. On tx failure, uploaded files are removed
// (best-effort) and the action returns an error.
//
// Spec R1 audit_log: public create writes NO audit_log row (parity confirmed).

const WELFARE_KINDS = [
  "abandonment",
  "neglect",
  "physical_abuse",
  "chained",
  "no_shelter",
  "hoarding",
  "dog_fighting",
  "trafficking",
  "other",
];
const WELFARE_SEVERITIES = ["low", "medium", "high", "critical"];
const WELFARE_SUBJECT_KINDS = ["registered_pet", "unowned_animal", "location", "general"];
const ORG_WELFARE_ROLES = new Set(["admin", "coordinator", "member", "vet_individual"]);

export async function createWelfareReportAction(
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rate-limit all submissions. Anonymous users get a tight IP-keyed cap;
  // authenticated users get a generous per-user cap so flood attacks via
  // accounts are still bounded.
  if (!user) {
    const hdrs = await headers();
    const ip = callerIp(hdrs);
    try {
      await enforceRateLimit("welfare_anon", ip, {
        maxPerMinute: 1,
        maxPerHour: 3,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          error:
            "Estás enviando demasiadas denuncias seguidas. Esperá unos minutos y volvé a intentar. Si tenés muchos casos legítimos para reportar, considerá crear una cuenta.",
        };
      }
      throw err;
    }
  } else {
    try {
      await enforceRateLimit("welfare_auth", user.id, {
        maxPerHour: 10,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          error:
            "Estás enviando demasiadas denuncias seguidas. Esperá unos minutos y volvé a intentar. Si tenés muchos casos legítimos para reportar, considerá crear una cuenta.",
        };
      }
      throw err;
    }
  }

  // Parse fields
  const kind = String(formData.get("kind") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const loc = parseLocationFromFormData(formData);
  // locality:"soft" — a public, anonymous maltrato report must NEVER hard-block
  // because the geocoder returned a locality that isn't in the INDEC catalog
  // (e.g. a CABA point, or a town OSM names differently). Soft passes the raw
  // locality through (localityCanonical=false) instead of throwing; the authority
  // still routes by province + coords + address. Exact CABA barrios resolve via
  // the CABA-aware pickLocality in lib/geocoding.ts.
  //
  // requireCoords:true — FIX #3A (QA 2026-07-10): the wizard now requires an exact
  // map point, and the canonical locality is inferred from it. Enforce coords
  // server-side too (defense-in-depth) so a denuncia can never be created without
  // a precise location. The DenunciaWizard blocks submit client-side; this catches
  // any direct/legacy caller. Reverse-geocode of the point fills province/locality
  // (soft); if that lookup is thin the row may still land locality-less — those
  // residual rows are surfaced to whole-province operators by lib/metrics/scope.ts.
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, {
      locality: "soft",
      requireCoords: true,
    });
  } catch (err) {
    if (err instanceof JurisdictionValidationError) {
      return { error: err.message };
    }
    if (err instanceof CoordError) {
      return {
        error:
          err.code === "COORD_REQUIRED"
            ? "Marcá el lugar exacto en el mapa antes de enviar la denuncia."
            : err.message,
      };
    }
    throw err;
  }
  const locationAddress = normalizedLoc.address;
  // D.11 (PO, 2026-07-31) — GEOCODER-DOWN FALLBACK. The (province, locality)
  // above is derived CLIENT-side by LocationFields from a geocoder result. When
  // nominatim is unreachable those hidden inputs arrive empty and the row lands
  // with jurisdiction_province NULL — invisible to every govt queue, because
  // every branch of jurisdictionPairClause tests province equality. Rather than
  // lose the denuncia, recover the jurisdiction from the address text the
  // citizen typed and MARK IT UNVERIFIED. The mark is not bookkeeping: the
  // triage row renders it (WelfareDenunciaRow), which is the condition the PO
  // attached to accepting the mis-routing risk.
  const routable = await resolveRoutableJurisdiction({
    province: normalizedLoc.province,
    locality: normalizedLoc.locality,
    localityId: normalizedLoc.localityId,
    addressText: locationAddress,
  });
  const jurisdictionProvince: string | null = routable.province;
  const jurisdictionLocality: string | null = routable.locality;
  // Structural locality-attribution FK (migration 0147) for the welfare_reports row.
  const jurisdictionLocalityId: string | null = routable.localityId;
  const jurisdictionUnverified = routable.unverified;
  const locationLatRaw = normalizedLoc.lat !== null ? String(normalizedLoc.lat) : "";
  const locationLngRaw = normalizedLoc.lng !== null ? String(normalizedLoc.lng) : "";
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const reporterContactEmail = String(formData.get("reporterContactEmail") ?? "").trim() || null;
  const reporterContactPhone = String(formData.get("reporterContactPhone") ?? "").trim() || null;
  const observedSymptoms = String(formData.get("observedSymptoms") ?? "").trim() || null;
  const dwellTimeMsRaw = String(formData.get("dwellTimeMs") ?? "").trim();
  const dwellTimeMs = dwellTimeMsRaw ? Number.parseInt(dwellTimeMsRaw, 10) : undefined;
  const honeypotValue = String(formData.get("_hp") ?? "");
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  // Anonymity choice from the wizard's final step ("anonymous" | "with_contact").
  // PO decision (2026-07-08): honor "Enviar anónima" completely — a logged-in
  // user who chooses anonymous is NOT linked to the report (reporter_user_id
  // stays null), consistent with the finder-in-possession precedent and the
  // strongest posture before data-protection officials. Only a non-anonymous
  // submission attaches the account. The flag is absent for legacy callers, in
  // which case the prior behavior (attach the session user) is preserved.
  const isAnonymous = String(formData.get("contactMode") ?? "").trim() === "anonymous";
  const reporterUserId = isAnonymous ? null : (user?.id ?? null);

  // Validate
  if (!WELFARE_KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (!WELFARE_SEVERITIES.includes(severity)) return { error: "Gravedad inválida." };
  if (!description) return { error: "Falta la descripción de la situación." };
  if (description.length < 20)
    return {
      error: "La descripción debe tener al menos 20 caracteres para poder ser actuable.",
    };
  if (!WELFARE_SUBJECT_KINDS.includes(subjectKind))
    return { error: "Sujeto de la denuncia inválido." };
  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  let locationLat: string | null = null;
  let locationLng: string | null = null;
  if (locationLatRaw || locationLngRaw) {
    if (!locationLatRaw || !locationLngRaw) {
      return { error: "Se requieren ambas coordenadas: latitud y longitud." };
    }
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Revisá latitud y longitud." };
    }
    const point = writePoint({ lat, lng });
    locationLat = point.locationLat;
    locationLng = point.locationLng;
  }

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  // File upload BEFORE tx
  const attachmentEntries = formData.getAll("attachment");
  const files = attachmentEntries
    .filter((e): e is File => e instanceof File)
    .filter((f) => f.size > 0);

  let uploadResult: Awaited<ReturnType<typeof uploadWelfareEvidence>> | null = null;
  // We need a temporary ID for the upload path — we'll use a pre-generated UUID.
  // The report row is inserted first (outside tx), so we use insertedId from the use-case
  // result. However, the original uploads AFTER the insert. We follow parity:
  // upload after insert, before the attachment tx.
  // The use-case handles this by receiving pre-uploaded attachment refs.
  // We do a two-phase: (1) call use-case for insert only, (2) upload, (3) complete tx.
  // Parity simplification: we call the use-case with uploadResult that may be null initially.
  // Actually, looking at the original: insert report → upload → attachment tx.
  // We follow same order but the use-case handles insert internally.
  // The action calls uploadWelfareEvidence AFTER the use-case inserts the report row.
  // But the use-case doesn't return the ID until it runs. This requires a split approach.
  //
  // Design choice: use-case accepts pre-resolved attachment refs. We pre-insert the report
  // via repo directly here (same as original: insert outside tx, then upload, then tx).
  // This matches the original exactly.

  // Phase 1: call use-case (which inserts the report + runs the tx)
  // But we need the reportId BEFORE uploading. The original inserts first, then uploads.
  // We mirror this exactly by pre-inserting via repo, then uploading, then running the use-case's tx path.
  // However, our use-case design does everything atomically. Let's adjust to match parity:
  // The use-case's insertReportWithRetry runs FIRST (outside tx in our impl too), then we upload, then tx.
  // This is exactly what the use-case does — insert first, return reportId, then tx.
  // We can upload between insertReportWithRetry and the tx by splitting concerns.
  //
  // Practical solution: run the whole use-case with empty attachments to get insertedId,
  // upload, then... that doesn't work since the tx already ran.
  //
  // Correct parity: upload happens in the ACTION (not use-case). The use-case receives
  // the already-uploaded attachment rows. We need the reportId from insertReportWithRetry
  // BEFORE the upload. The use-case does: insert → upload → tx. We match by:
  // 1. Call use-case with files=[] (empty), get reportId from return value.
  // 2. If files, upload using reportId.
  // 3. If upload fails, return error (report row stays — parity).
  // 4. But use-case already ran the tx...
  //
  // The cleanest parity approach: the use-case handles insert+tx atomically with pre-uploaded refs.
  // The action does: (1) parse, (2) pre-upload (needs reportId — but we don't have it yet),
  // OR: the action uses a pre-generated UUID and pre-uploads to that path.
  // Original actually uploads AFTER insert (using insertedId).
  //
  // Resolution: follow the original EXACTLY. The action owns the two-phase flow:
  // (1) insert via repo.insertReportWithRetry directly in the action,
  // (2) upload using the returned ID,
  // (3) pass uploadResult to a narrower use-case that only does the tx portion.
  // This is the cleanest split and matches parity perfectly.
  //
  // For WU-3 we keep this in the action (not use-case) to match original exactly.

  // Insert the report row (outside tx — parity with original)
  const insertResult = await repo
    .insertReportWithRetry(
      {
        reporterUserId,
        reporterContactEmail,
        reporterContactPhone,
        kind: kind as Parameters<typeof repo.insertReportWithRetry>[0]["kind"],
        severity: severity as Parameters<typeof repo.insertReportWithRetry>[0]["severity"],
        description,
        subjectKind: subjectKind as Parameters<typeof repo.insertReportWithRetry>[0]["subjectKind"],
        subjectPetId: null, // resolved inside use-case
        subjectDescription,
        locationAddress,
        jurisdictionProvince,
        jurisdictionLocality,
        localityId: jurisdictionLocalityId,
        jurisdictionUnverified,
        locationLat,
        locationLng,
        occurredAt,
        referenceCode: generateReferenceCode(),
      },
      undefined,
      generateReferenceCode,
    )
    .catch((err) => {
      return { error: err instanceof Error ? err.message : "error desconocido" } as const;
    });

  if ("error" in insertResult) {
    return { error: insertResult.error };
  }

  const { id: insertedId, referenceCode } = insertResult;

  // Upload files (after insert, before tx — parity)
  if (files.length > 0) {
    uploadResult = await uploadWelfareEvidence(insertedId, files);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  // Resolve pet + ownership at the action level (needed for role derivation in use-case)
  let subjectPetId: string | null = null;
  let isOwnerOfSubjectPet = false;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    subjectPetId = (await repo.findPetByToken(subjectPetToken))?.id ?? null;
    // Gate ownership resolution on the effective reporter id: an anonymous
    // submission must not reveal that the reporter is the pet's owner (that
    // would make the report attributable), so it is treated as a third party.
    if (subjectPetId && reporterUserId) {
      const ownership = await repo.findActiveOwnership(subjectPetId, reporterUserId);
      isOwnerOfSubjectPet = ownership != null;
    }
  }

  const attachments = (uploadResult?.uploaded ?? []).map((u) => ({
    storagePath: u.storagePath,
    mimeType: u.mimeType,
    fileSize: u.fileSize,
    originalFilename: u.originalFilename,
  }));

  const result = await createWelfareReport(
    {
      reportId: insertedId,
      referenceCode,
      kind,
      severity,
      description,
      subjectKind,
      subjectPetId,
      isOwnerOfSubjectPet,
      subjectDescription,
      locationAddress,
      jurisdictionProvince,
      jurisdictionLocality,
      locationLat,
      locationLng,
      occurredAt,
      reporterContactEmail,
      reporterContactPhone,
      observedSymptoms,
      attachments,
      uploadedPaths: uploadResult?.uploadedPaths ?? [],
      reporterUserId,
      dwellTimeMs: Number.isFinite(dwellTimeMs) ? dwellTimeMs : undefined,
      honeypotValue,
      clientIdempotencyKey,
    },
    {
      repo,
      openCase: async (input) => openCase(input as Parameters<typeof openCase>[0]),
      computeFlagReasons,
      signal: async (opts) => {
        await signalWelfareReport(opts);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) {
    // Tx failed — clean up uploaded files.
    await removeWelfareEvidence(uploadResult?.uploadedPaths ?? []);
    return { error: result.error };
  }

  // Anonymous reporter → hand them a session now (rationale in
  // mintFreshReporterSession). Authenticated ones land on /denuncias/mias, which
  // is gated by a real session.
  if (!reporterUserId) await mintFreshReporterSession(insertedId);

  return { error: null, redirectTo: result.redirectTo };
}

// ---------------------------------------------------------------------------
// createOrgWelfareReportAction — R2 (org-side, professional)
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: requireUserOrRedirect THEN org-membership gate:
//   - non-leftAt membership in org by publicToken
//   - org.verified = true
//   - role ∈ {admin, coordinator, member, vet_individual}
//   - SCOPED TO THIS ORG ONLY (foster cross-org bypass lesson)
//
// Spec R2: audit_log REQUIRED (welfare_report_submitted_by_org).

export async function createOrgWelfareReportAction(
  orgToken: string,
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const { user } = await requireUserOrRedirect();

  // Org membership gate — scoped to THIS org's publicToken
  const [orgRow] = await db
    .select({
      orgId: organizations.id,
      orgDisplayName: organizations.displayName,
      orgVerified: organizations.verified,
      memberRole: organizationMemberships.role,
    })
    .from(organizations)
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.publicToken, orgToken),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!orgRow) return { error: "No sos miembro activo de esta organización." };
  if (!orgRow.orgVerified) {
    return { error: "Tu organización todavía no está verificada por miMAR." };
  }
  if (!ORG_WELFARE_ROLES.has(orgRow.memberRole)) {
    return {
      error:
        "Tu rol dentro de la organización no habilita el reporte de maltrato. Pediselo a un coordinador.",
    };
  }

  // Parse fields
  const kind = String(formData.get("kind") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const loc = parseLocationFromFormData(formData);
  // locality:"soft" — same rationale as the public report: never hard-block an
  // org welfare report on a geocoder locality that isn't catalog-canonical. Soft
  // passes raw locality through; routing uses province + coords + address.
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "soft" });
  } catch (err) {
    if (err instanceof JurisdictionValidationError) {
      return { error: err.message };
    }
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }
  const locationAddress = normalizedLoc.address;
  // D.11 geocoder-down fallback — same gate as the public intake above. An org
  // report reaches the SAME jurisdiction-scoped triage queue, so a null province
  // makes it just as invisible; there is no reason the professional path should
  // be the one that silently loses reports.
  const routable = await resolveRoutableJurisdiction({
    province: normalizedLoc.province,
    locality: normalizedLoc.locality,
    localityId: normalizedLoc.localityId,
    addressText: locationAddress,
  });
  const jurisdictionProvince: string | null = routable.province;
  const jurisdictionLocality: string | null = routable.locality;
  // Structural locality-attribution FK (migration 0147) for the welfare_reports row.
  const jurisdictionLocalityId: string | null = routable.localityId;
  const jurisdictionUnverified = routable.unverified;
  const locationLatRaw = normalizedLoc.lat !== null ? String(normalizedLoc.lat) : "";
  const locationLngRaw = normalizedLoc.lng !== null ? String(normalizedLoc.lng) : "";
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const observedSymptoms = String(formData.get("observedSymptoms") ?? "").trim() || null;
  const orgClientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  // Validate
  if (!WELFARE_KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (description.length < 100) {
    return {
      error:
        "La descripción profesional debe tener al menos 100 caracteres con contexto operativo.",
    };
  }
  if (!WELFARE_SUBJECT_KINDS.includes(subjectKind))
    return { error: "Sujeto de la denuncia inválido." };
  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  let locationLat: string | null = null;
  let locationLng: string | null = null;
  if (locationLatRaw || locationLngRaw) {
    if (!locationLatRaw || !locationLngRaw) {
      return { error: "Se requieren ambas coordenadas: latitud y longitud." };
    }
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Revisá latitud y longitud." };
    }
    const point = writePoint({ lat, lng });
    locationLat = point.locationLat;
    locationLng = point.locationLng;
  }

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  // File upload required for org reports (spec R2)
  const attachmentEntries = formData.getAll("attachment");
  const files = attachmentEntries
    .filter((e): e is File => e instanceof File)
    .filter((f) => f.size > 0);
  if (files.length === 0) {
    return { error: "Una denuncia profesional requiere al menos un adjunto de evidencia." };
  }

  // Insert the report row (outside tx — parity with original createOrgWelfareReportAction)
  const insertResult = await repo
    .insertReportWithRetry(
      {
        reporterUserId: user.id,
        reporterOrganizationId: orgRow.orgId,
        kind: kind as Parameters<typeof repo.insertReportWithRetry>[0]["kind"],
        severity: "critical", // OA2: server-authoritative
        description,
        subjectKind: subjectKind as Parameters<typeof repo.insertReportWithRetry>[0]["subjectKind"],
        subjectPetId: null, // resolved inside use-case
        subjectDescription,
        locationAddress,
        jurisdictionProvince,
        jurisdictionLocality,
        localityId: jurisdictionLocalityId,
        jurisdictionUnverified,
        locationLat,
        locationLng,
        occurredAt,
        referenceCode: generateReferenceCode(),
      },
      undefined,
      generateReferenceCode,
    )
    .catch((err) => {
      return { error: err instanceof Error ? err.message : "error desconocido" } as const;
    });

  if ("error" in insertResult) {
    return { error: insertResult.error };
  }

  const { id: insertedId, referenceCode: orgReferenceCode } = insertResult;

  // Upload evidence files
  const uploadResult = await uploadWelfareEvidence(insertedId, files);
  if (uploadResult.error) return { error: uploadResult.error };

  // Resolve pet at the action level (org reporters are always "witnesses" — no ownership check)
  let subjectPetId: string | null = null;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    subjectPetId = (await repo.findPetByToken(subjectPetToken))?.id ?? null;
  }

  const attachments = uploadResult.uploaded.map((u) => ({
    storagePath: u.storagePath,
    mimeType: u.mimeType,
    fileSize: u.fileSize,
    originalFilename: u.originalFilename,
  }));

  const result = await createOrgWelfareReport(
    {
      reportId: insertedId,
      referenceCode: orgReferenceCode,
      kind,
      severity: "critical",
      description,
      subjectKind,
      subjectPetId,
      subjectDescription,
      locationAddress,
      jurisdictionProvince,
      jurisdictionLocality,
      locationLat,
      locationLng,
      occurredAt,
      observedSymptoms,
      attachments,
      uploadedPaths: uploadResult.uploadedPaths,
      orgMember: {
        userId: user.id,
        orgId: orgRow.orgId,
        orgDisplayName: orgRow.orgDisplayName,
        orgVerified: orgRow.orgVerified,
        memberRole: orgRow.memberRole,
      },
      orgToken,
      clientIdempotencyKey: orgClientIdempotencyKey,
    },
    {
      repo,
      openCase: async (input) => openCase(input as Parameters<typeof openCase>[0]),
      findGovtRecipients: async (opts) =>
        findAuthoritiesForJurisdiction(opts, { route: "welfare_org_side_critical_received" }),
      signal: async (opts) => {
        await signalWelfareReport(opts);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) {
    await removeWelfareEvidence(uploadResult.uploadedPaths);
    return { error: result.error };
  }

  return { error: null, redirectTo: result.redirectTo };
}

// ---------------------------------------------------------------------------
// addReporterCommentAction — reporter adds a free-text note to their case
// ---------------------------------------------------------------------------

export type ReporterCommentResult = { ok: true } | { ok: false; error: string };

export async function addReporterCommentAction(
  welfareReportId: string,
  text: string,
): Promise<ReporterCommentResult> {
  const session = await requireUserOrRedirect();

  const result = await addReporterComment(
    { reportId: welfareReportId, reporterUserId: session.user.id, text },
    {
      repo: { findById: repo.findById.bind(repo) },
      insertCaseEvent: repo.insertCaseEvent.bind(repo),
    },
  );

  if (!result.ok) {
    const errorMessages: Record<string, string> = {
      forbidden: "No tenés permiso para comentar en esta denuncia.",
      validation: "El comentario debe tener entre 1 y 2000 caracteres.",
      no_case: "Esta denuncia aún no tiene un caso asociado.",
      report_not_found: "Denuncia no encontrada.",
      db_error: "Error al guardar el comentario. Intentá de nuevo.",
    };
    return { ok: false, error: errorMessages[result.error] ?? "Error inesperado." };
  }

  revalidatePath(`/denuncias/${welfareReportId}`);
  return { ok: true };
}
