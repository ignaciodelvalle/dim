"use server";

// Alert firing server actions + writer — Paquete K (alert inbox + triage).
//
// Two surfaces:
//
//   (A) WRITER — recordFiringsForUser / evaluateAndRecordFiringsForAllAdmins
//       Runs the existing evaluateAlertSubscriptions evaluator and, for each
//       breaching subscription, INSERTs an alert_firings row when
//       shouldOpenFiring allows (dedup: one open firing per subscription).
//       Invoked from the daily evaluate-alerts cron.
//
//   (B) TRIAGE ACTIONS — admin-only mutations driven by the inbox row actions:
//       acknowledgeFiringAction   disparada → reconocida
//       openInvestigationFiringAction (active_zoonosis only) reconocida → en_investigacion
//       registerFollowupFiringAction  (non-zoonosis) append a note, no state change
//       contactAuthorityFiringAction  → autoridad_contactada (+ outbox notifications)
//       resolveFiringAction       → resuelta
//       dismissFiringAction       → descartada
//
// Auth: every triage action resolves the caller via createClient().auth.getUser()
// and re-checks role='admin' in profiles (never trusts the client). Writes go
// through Drizzle (BYPASSRLS service-role). State transitions are validated by
// the pure nextStatus() — an illegal transition returns { error }, never a write.
//
// AUDIT_LOG: NONE for transitions (decision K-D4 — the *_at/*_by columns ARE the
// trail). The inbox LIST view writes a pii_queried row in app/admin/alertas/page.tsx.

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  ALERT_FIRING_OPEN_STATUSES,
  type AlertFiring,
  alertFirings,
  alertSubscriptions,
  db,
  notifications,
  profiles,
} from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { evaluateAlertSubscriptions } from "@/lib/metrics/alert-evaluation";
import {
  type AlertFiringTransition,
  investigationDiseaseCode,
  metricOpensInvestigation,
  nextStatus,
  shouldOpenFiring,
} from "@/lib/metrics/alert-firing";
import { createClient } from "@/lib/supabase/server";
import { openOutbreakInvestigationAction } from "@/src/modules/surveillance/actions";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type FiringActionResult = { ok: true } | { error: string };

// es-AR metric labels (kept here so actions can build investigation reasons /
// notification copy without importing the page). Mirrors ALERT_METRIC_LABEL.
const METRIC_LABEL_ES: Record<string, string> = {
  active_zoonosis: "Casos de zoonosis activos",
  eno_sla_ontime_pct: "SLA ENO en tiempo",
  queue_oldest_days: "Días sin atender (cola)",
  sterilization_coverage_pct: "Cobertura de esterilización",
  microchip_penetration_pct: "Penetración de microchip",
  open_welfare_reports: "Denuncias de maltrato abiertas",
};

function jurisdictionLabel(province: string | null, locality: string | null): string {
  if (province && locality) return `${locality}, ${province}`;
  if (province) return province;
  return "nivel nacional";
}

// ---------------------------------------------------------------------------
// Auth helper (admin-only)
// ---------------------------------------------------------------------------

async function requireAdminUser(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { error: "Sesión expirada" };

  const [profile] = await db
    .select({ role: profiles.role, deactivatedAt: profiles.deactivatedAt })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.role !== "admin" || profile.deactivatedAt !== null) {
    return { error: "Acceso restringido a administradores" };
  }
  return { userId: user.id };
}

// ---------------------------------------------------------------------------
// (A) WRITER — evaluation → persistence with dedup
// ---------------------------------------------------------------------------

export type RecordFiringsResult = {
  /** Subscriptions evaluated. */
  evaluated: number;
  /** Subscriptions currently breaching. */
  breaching: number;
  /** New firings inserted (after dedup). */
  opened: number;
};

/**
 * Evaluate one admin user's active subscriptions and open firings for any new
 * breaches. Pure-decision (shouldOpenFiring) gates each insert; the dedup query
 * resolves existing OPEN firings per subscription so a second firing is never
 * opened while one is already in the inbox.
 *
 * Exported (not just used by the cron) so the writer is independently testable.
 */
export async function recordFiringsForUser(userId: string): Promise<RecordFiringsResult> {
  const evals = await evaluateAlertSubscriptions(userId, { role: "admin" });
  const breaching = evals.filter((e) => e.breaching);

  let opened = 0;

  for (const ev of breaching) {
    // Resolve existing OPEN firings for this exact (subscription, jurisdiction).
    const existing = await db
      .select({ status: alertFirings.status })
      .from(alertFirings)
      .where(
        and(
          eq(alertFirings.subscriptionId, ev.id),
          inArray(alertFirings.status, [...ALERT_FIRING_OPEN_STATUSES]),
        ),
      );

    if (!shouldOpenFiring(existing, { breaching: ev.breaching })) continue;

    await db.insert(alertFirings).values({
      subscriptionId: ev.id,
      metricKey: ev.metricKey,
      direction: ev.direction,
      threshold: String(ev.threshold),
      observedValue: String(ev.currentValue ?? 0),
      jurisdictionProvince: ev.jurisdictionProvince ?? null,
      jurisdictionLocality: ev.jurisdictionLocality ?? null,
      status: "disparada",
    });
    opened += 1;
  }

  return { evaluated: evals.length, breaching: breaching.length, opened };
}

/**
 * Evaluate EVERY active subscription across all admin owners and open firings.
 * Used by the daily cron so evaluation does not depend on an admin opening
 * /admin/programa. Subscriptions are owned per-actor, so we evaluate per owner.
 *
 * @no-auth-required: invoked only by the CRON_SECRET-gated
 * /api/cron/evaluate-alerts route (authorizeCronRequest is the auth boundary);
 * not a user-facing action. Takes no caller identity.
 */
export async function evaluateAndRecordFiringsForAllAdmins(): Promise<RecordFiringsResult> {
  // Distinct owners of at least one ACTIVE subscription = the set to evaluate.
  const owners = await db
    .selectDistinct({ actorUserId: alertSubscriptions.actorUserId })
    .from(alertSubscriptions)
    .where(eq(alertSubscriptions.isActive, true));

  const totals: RecordFiringsResult = { evaluated: 0, breaching: 0, opened: 0 };
  for (const { actorUserId } of owners) {
    const res = await recordFiringsForUser(actorUserId);
    totals.evaluated += res.evaluated;
    totals.breaching += res.breaching;
    totals.opened += res.opened;
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Triage helpers
// ---------------------------------------------------------------------------

/** Load a firing by id (admin scope — no row-level filter beyond existence). */
async function loadFiring(id: string): Promise<AlertFiring | null> {
  const [row] = await db.select().from(alertFirings).where(eq(alertFirings.id, id)).limit(1);
  return row ?? null;
}

/** Apply a validated transition; returns the resolved next status or an error. */
function resolveTransition(
  firing: AlertFiring,
  transition: AlertFiringTransition,
): { next: NonNullable<ReturnType<typeof nextStatus>> } | { error: string } {
  const next = nextStatus(firing.status, transition);
  if (next === null) {
    return { error: `Transición inválida desde "${firing.status}".` };
  }
  return { next };
}

// ---------------------------------------------------------------------------
// (B) TRIAGE ACTIONS
// ---------------------------------------------------------------------------

/** Reconocer — disparada → reconocida. Sets acknowledged_at/by. */
export async function acknowledgeFiringAction(firingId: string): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const firing = await loadFiring(firingId);
  if (!firing) return { error: "Alerta no encontrada" };

  const t = resolveTransition(firing, "acknowledge");
  if ("error" in t) return t;

  await db
    .update(alertFirings)
    .set({ status: t.next, acknowledgedAt: new Date(), acknowledgedBy: auth.userId })
    .where(eq(alertFirings.id, firingId));

  revalidatePath("/admin/alertas");
  return { ok: true };
}

/**
 * Abrir investigación — reconocida → en_investigacion. ONLY for active_zoonosis
 * (the only disease-mapped metric, decision K-D2). Pre-calls
 * openOutbreakInvestigationAction and stores the returned publicCode as
 * investigation_code. Non-zoonosis metrics must use registerFollowupFiringAction.
 */
export async function openInvestigationFiringAction(firingId: string): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const firing = await loadFiring(firingId);
  if (!firing) return { error: "Alerta no encontrada" };

  if (!metricOpensInvestigation(firing.metricKey)) {
    return {
      error: "Esta métrica no abre un expediente. Usá “Registrar seguimiento” en su lugar.",
    };
  }

  const diseaseCode = investigationDiseaseCode(firing.metricKey);
  if (!diseaseCode) return { error: "No hay enfermedad mapeada para esta métrica." };

  const t = resolveTransition(firing, "open_investigation");
  if ("error" in t) return t;

  const metricLabel = METRIC_LABEL_ES[firing.metricKey] ?? firing.metricKey;
  const where = jurisdictionLabel(firing.jurisdictionProvince, firing.jurisdictionLocality);

  // Reuse the full investigations flow — opens the expediente + notifies govts.
  const opened = await openOutbreakInvestigationAction({
    diseaseCode,
    reason: `Alerta ${metricLabel} en ${where}`,
    linkedSignalEventId: null,
  });
  if ("error" in opened) return { error: opened.error };

  await db
    .update(alertFirings)
    .set({ status: t.next, investigationCode: opened.publicCode })
    .where(eq(alertFirings.id, firingId));

  revalidatePath("/admin/alertas");
  return { ok: true };
}

/**
 * Registrar seguimiento — append a note to the firing WITHOUT opening an
 * expediente. The "investigation" alternative for non-disease-mapped metrics
 * (decision K-D2). Does NOT change status (it remains reconocida) — the note is
 * the lightweight record. Returns an error for zoonosis (use openInvestigation).
 */
export async function registerFollowupFiringAction(
  firingId: string,
  note: string,
): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const trimmed = note.trim();
  if (!trimmed) return { error: "Escribí una nota de seguimiento." };

  const firing = await loadFiring(firingId);
  if (!firing) return { error: "Alerta no encontrada" };

  if (metricOpensInvestigation(firing.metricKey)) {
    return {
      error: "Esta métrica abre un expediente. Usá “Abrir investigación”.",
    };
  }

  // Firing must be acknowledged first (a note belongs to a worked alert).
  if (firing.status !== "reconocida" && firing.status !== "en_investigacion") {
    return { error: "Reconocé la alerta antes de registrar un seguimiento." };
  }

  const stamped = `[${new Date().toISOString()}] ${trimmed}`;
  const merged = firing.notes ? `${firing.notes}\n${stamped}` : stamped;

  await db.update(alertFirings).set({ notes: merged }).where(eq(alertFirings.id, firingId));

  revalidatePath("/admin/alertas");
  return { ok: true };
}

/**
 * Contactar autoridad — resolve the govt profiles of the firing's jurisdiction
 * via govt_assignments (findAuthoritiesForJurisdiction, which falls back to
 * admins when no govt covers the locality), send an in-app outbox notification,
 * and transition to autoridad_contactada. Sets contacted_govt_user_id (first
 * resolved recipient) + contacted_at.
 */
export async function contactAuthorityFiringAction(firingId: string): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const firing = await loadFiring(firingId);
  if (!firing) return { error: "Alerta no encontrada" };

  const t = resolveTransition(firing, "contact_authority");
  if ("error" in t) return t;

  // A jurisdiction is required to resolve an authority. Global metrics
  // (queue_oldest_days) have no province — cannot route a local authority.
  if (!firing.jurisdictionProvince || !firing.jurisdictionLocality) {
    return {
      error: "Esta alerta no tiene jurisdicción local; no hay autoridad a contactar.",
    };
  }

  const recipients = await findAuthoritiesForJurisdiction({
    province: firing.jurisdictionProvince,
    locality: firing.jurisdictionLocality,
  });
  if (recipients.length === 0) {
    return { error: "No encontramos autoridades para esta jurisdicción." };
  }

  const metricLabel = METRIC_LABEL_ES[firing.metricKey] ?? firing.metricKey;
  const where = jurisdictionLabel(firing.jurisdictionProvince, firing.jurisdictionLocality);

  // In-app outbox notification (v1 channel — decision K-D5).
  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      notificationType: "alert_authority_contacted",
      title: `Alerta sanitaria: ${metricLabel}`,
      body: `Un administrador escaló una alerta de "${metricLabel}" en ${where}. Revisá la situación en tu jurisdicción.`,
      severity: "warning" as const,
      category: "admin",
      ctaLabel: "Ver vigilancia",
      ctaUrl: "/gob/vigilancia",
    })),
  );

  await db
    .update(alertFirings)
    .set({
      status: t.next,
      contactedGovtUserId: recipients[0],
      contactedAt: new Date(),
    })
    .where(eq(alertFirings.id, firingId));

  revalidatePath("/admin/alertas");
  return { ok: true };
}

/** Resolver — close the firing with notes → resuelta. */
export async function resolveFiringAction(
  firingId: string,
  notes: string,
): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  return closeFiring(firingId, "resolve", notes);
}

/** Descartar — close the firing with notes → descartada. */
export async function dismissFiringAction(
  firingId: string,
  notes: string,
): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;
  return closeFiring(firingId, "dismiss", notes);
}

async function closeFiring(
  firingId: string,
  transition: "resolve" | "dismiss",
  notes: string,
): Promise<FiringActionResult> {
  const auth = await requireAdminUser();
  if ("error" in auth) return auth;

  const firing = await loadFiring(firingId);
  if (!firing) return { error: "Alerta no encontrada" };

  const t = resolveTransition(firing, transition);
  if ("error" in t) return t;

  const trimmed = notes.trim();
  const merged = trimmed
    ? firing.notes
      ? `${firing.notes}\n[cierre] ${trimmed}`
      : `[cierre] ${trimmed}`
    : firing.notes;

  await db
    .update(alertFirings)
    .set({
      status: t.next,
      notes: merged,
      resolvedAt: new Date(),
      resolvedBy: auth.userId,
    })
    .where(eq(alertFirings.id, firingId));

  revalidatePath("/admin/alertas");
  return { ok: true };
}
