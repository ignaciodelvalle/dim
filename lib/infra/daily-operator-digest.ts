import "server-only";

// Daily operator digest (T2-N1) — recipient resolution + send.
//
// SCOPE, STATED PLAINLY. "Pending items" here means the SAME queues an
// operator already sees badged on their own landing:
//   - govt/national: countVisiblePendingRequests (lib/infra/approval-scope.ts)
//     — the /gob "Aprobaciones" queue (vet role-upgrade + org-verification
//     requests visible in the govt's own jurisdiction). This is deliberately
//     NARROWER than the full /gob home briefing (which also bundles denuncias
//     de maltrato, casos abiertos, etc.) — a scope call for this S–M item: one
//     well-scoped, already-tested counter beats re-deriving five more.
//   - org members (incl. vet_individual, who hold membership in their own
//     solo-clinic org): applicableOrgQueues + fetchOrgQueueCounts
//     (lib/analytics/org-dashboard.ts) — the SAME catalog and counters the org
//     panel and its nav badges use. Only queues with a `navPath` (the ones the
//     panel actually BADGES as needing a decision) count toward the digest —
//     `activeFosters` has none on purpose (informational, not actionable) and
//     must not inflate a "you have pending work" mail with a non-actionable
//     count.
//
// Admin is OUT OF SCOPE. Admin has universal, not jurisdiction-scoped, read —
// there is no single "this admin's queue" the way there is for a govt or an
// org member, and building one is a different, larger question than this
// item's S–M size. Noted for the PO, not silently dropped.
//
// RECIPIENT FILTER, every branch: profiles.deactivatedAt IS NULL AND
// profiles.deletedAt IS NULL AND profiles.dailyDigestOptOut = false. A
// deactivated or erased account never receives mail regardless of its queue
// counts — matches requireLiveUser's own precedence (erasure/deactivation
// refuse before anything else runs).
//
// IDEMPOTENCY. Before composing a mail for a user, this module claims the
// send with a conditional UPDATE on profiles.dailyDigestLastSentOn (see
// migration 0230's header for the exact statement and why the row lock makes
// it safe under a retried/duplicate dispatcher pass with no separate dedupe
// table). The claim happens BEFORE the Resend call: a transient send failure
// is logged and the user simply does not get a retry until tomorrow's run —
// the same "presence of a key is not proof of delivery" honesty
// outbound-channels.ts already states, rather than building a second
// mechanism to chase exactly-once delivery for a daily summary email.
//
// NEVER CRASHES THE CRON. Every recipient is processed in its own try/catch;
// one bad row (a DB error building an org's counts, a Resend throw) is logged
// and the run continues to the next candidate — the withCronRun caller
// reports partial failure via the returned counts, never via an uncaught
// throw. Unconfigured mail (`deriveOutboundChannels` not "configured") short-
// circuits the WHOLE run before any candidate is touched or claimed, so a
// misconfigured environment never claims a send it cannot make.

import { Resend } from "resend";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, govtAssignments, organizationMemberships, organizations, profiles } from "@/db";
import {
  type OrgQueueKey,
  applicableOrgQueues,
  fetchOrgQueueCounts,
} from "@/lib/analytics/org-dashboard";
import {
  type ComposeDigestInput,
  type DigestQueueItem,
  composeDigestEmail,
} from "@/lib/digest/daily-operator-digest-composer";
import type { GobReadRole } from "@/lib/domain/jurisdiction-canonical";
import { countVisiblePendingRequests } from "@/lib/infra/approval-scope";
import { generateDigestUnsubscribeToken } from "@/lib/infra/digest-unsubscribe-token";
import { deriveOutboundChannels, resolveMailSender } from "@/lib/infra/outbound-channels";
import { resolveSiteUrl } from "@/lib/infra/site-url";
import { buildAuthEmailMap, createAdminClient } from "@/lib/supabase/admin";

/** Argentina calendar day (fixed -03:00, no DST) — the idempotency day, never UTC. */
export function arCalendarDay(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

type Candidate = {
  userId: string;
  recipientLabel: "gobierno" | "organización";
  items: DigestQueueItem[];
};

export type DailyOperatorDigestResult = {
  candidates: number;
  sent: number;
  alreadySentToday: number;
  skippedNoEmail: number;
  errors: number;
  mailChannel: "configured" | "restricted" | "unconfigured" | "not-built";
};

async function resolveGovtCandidates(siteUrl: string): Promise<Candidate[]> {
  const govts = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(
      and(
        eq(profiles.role, "govt"),
        eq(profiles.accountType, "institutional"),
        isNull(profiles.deactivatedAt),
        isNull(profiles.deletedAt),
        eq(profiles.dailyDigestOptOut, false),
      ),
    );

  const candidates: Candidate[] = [];
  for (const govt of govts) {
    const jurisdictions = await db
      .select({
        province: govtAssignments.jurisdictionProvince,
        locality: govtAssignments.jurisdictionLocality,
      })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, govt.id), isNull(govtAssignments.revokedAt)));

    const count = await countVisiblePendingRequests(
      { id: govt.id, role: "govt" as GobReadRole },
      jurisdictions,
    );
    if (count <= 0) continue;

    candidates.push({
      userId: govt.id,
      recipientLabel: "gobierno",
      items: [
        {
          label: "Aprobaciones pendientes",
          count,
          href: `${siteUrl}/gob/cola`,
        },
      ],
    });
  }
  return candidates;
}

async function resolveOrgMemberCandidates(siteUrl: string): Promise<Candidate[]> {
  const rows = await db
    .select({
      membershipId: organizationMemberships.id,
      membershipRole: organizationMemberships.role,
      userId: organizationMemberships.userId,
      orgId: organizations.id,
      orgType: organizations.orgType,
      orgPublicToken: organizations.publicToken,
      profileDeactivatedAt: profiles.deactivatedAt,
      profileDeletedAt: profiles.deletedAt,
      profileOptOut: profiles.dailyDigestOptOut,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        isNull(organizationMemberships.leftAt),
        eq(organizations.status, "active"),
        isNull(profiles.deactivatedAt),
        isNull(profiles.deletedAt),
        eq(profiles.dailyDigestOptOut, false),
      ),
    );

  // Import lazily to avoid pulling the whole authz-resolver module graph into
  // every caller of this file (it is Drizzle-heavy and org-scoped).
  const { getGrantedCapabilities } = await import(
    "@/src/modules/organizations/infrastructure/authz-resolver"
  );

  const byUser = new Map<string, Candidate>();
  for (const row of rows) {
    const granted = await getGrantedCapabilities({
      id: row.membershipId,
      role: row.membershipRole,
    });
    const queues = applicableOrgQueues(row.orgType, granted, row.membershipRole).filter(
      (q) => q.navPath !== undefined,
    );
    if (queues.length === 0) continue;

    const keys: OrgQueueKey[] = queues.map((q) => q.key);
    const counts = await fetchOrgQueueCounts(row.orgId, keys);

    const items: DigestQueueItem[] = [];
    for (const q of queues) {
      const n = counts[q.key];
      if (!n || n <= 0) continue;
      items.push({
        label: q.label,
        count: n,
        href: `${siteUrl}/org/${row.orgPublicToken}/${q.path}`,
      });
    }
    if (items.length === 0) continue;

    const existing = byUser.get(row.userId);
    if (existing) {
      existing.items.push(...items);
    } else {
      byUser.set(row.userId, { userId: row.userId, recipientLabel: "organización", items });
    }
  }
  return Array.from(byUser.values());
}

/**
 * Claims today's send for `userId` — an atomic conditional UPDATE. Returns
 * true when THIS call won the claim (proceed to send); false when the user
 * already got today's digest (skip, idempotent no-op).
 */
async function claimDigestSend(userId: string, today: string): Promise<boolean> {
  const updated = await db
    .update(profiles)
    .set({ dailyDigestLastSentOn: today })
    .where(
      and(
        eq(profiles.id, userId),
        sql`${profiles.dailyDigestLastSentOn} IS DISTINCT FROM ${today}`,
      ),
    )
    .returning({ id: profiles.id });
  return updated.length > 0;
}

export async function runDailyOperatorDigest(): Promise<DailyOperatorDigestResult> {
  const env = process.env;
  const channels = deriveOutboundChannels(env);
  const emailChannel = channels.find((c) => c.key === "email");
  const mailChannel = emailChannel?.status ?? "unconfigured";

  const result: DailyOperatorDigestResult = {
    candidates: 0,
    sent: 0,
    alreadySentToday: 0,
    skippedNoEmail: 0,
    errors: 0,
    mailChannel,
  };

  // Fail closed to a logged skip, never a crash — the whole run short-
  // circuits before touching any recipient or claiming any send.
  if (mailChannel !== "configured") {
    console.warn(
      `[daily-operator-digest] mail channel is "${mailChannel}" — skipping this run entirely.`,
    );
    return result;
  }

  const siteUrl = resolveSiteUrl();
  const today = arCalendarDay();

  let candidates: Candidate[];
  try {
    const [govtCandidates, orgCandidates] = await Promise.all([
      resolveGovtCandidates(siteUrl),
      resolveOrgMemberCandidates(siteUrl),
    ]);
    candidates = [...govtCandidates, ...orgCandidates];
  } catch (err) {
    console.error("[daily-operator-digest] failed resolving recipients:", err);
    result.errors += 1;
    return result;
  }
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  const emailMap = await buildAuthEmailMap(createAdminClient());
  const resend = new Resend(env.RESEND_API_KEY);
  const from = resolveMailSender(env);

  for (const candidate of candidates) {
    try {
      const email = emailMap.get(candidate.userId);
      if (!email) {
        result.skippedNoEmail += 1;
        continue;
      }

      const claimed = await claimDigestSend(candidate.userId, today);
      if (!claimed) {
        result.alreadySentToday += 1;
        continue;
      }

      const token = generateDigestUnsubscribeToken(candidate.userId);
      const input: ComposeDigestInput = {
        recipientLabel: candidate.recipientLabel,
        items: candidate.items,
        unsubscribeUrl: `${siteUrl}/api/digest/unsubscribe?u=${candidate.userId}&t=${token}`,
        accountUrl: `${siteUrl}/cuenta`,
      };
      const { subject, html, text } = composeDigestEmail(input);

      const { error } = await resend.emails.send({ from, to: email, subject, html, text });
      if (error) {
        console.warn("[daily-operator-digest] Resend error for", candidate.userId, error);
        result.errors += 1;
        continue;
      }
      result.sent += 1;
    } catch (err) {
      console.error("[daily-operator-digest] failed sending to", candidate.userId, err);
      result.errors += 1;
    }
  }

  return result;
}
