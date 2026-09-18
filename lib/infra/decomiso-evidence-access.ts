// Who may see decomiso evidence — PO decision D7 (2026-09-18).
//
// Seizure evidence KEEPS its metadata (EXIF, GPS, capture time): the PO
// decided that metadata is itself evidence, so the upload stores the bytes
// exactly as they arrived (app/actions/decomiso.ts). A photo taken at the
// place of the seizure carries that place's coordinates. That is fine for the
// authority and for the organization the animal was handed to; it is not fine
// for everyone who later holds pet access.
//
// Before this module the evidence rode the generic pet-event readers (timeline
// thumbnails, event detail, libreta, API v1), so anyone with pet access could
// sign it: a caretaker, a co-owner, a foster, a rehome sponsor, a later
// custodial org that was never party to the seizure. Those readers now drop
// decomiso evidence unless the viewer can read THE DECOMISO itself:
//
//   · canReadCase(case, viewer) — the rule /casos/<code> already enforces:
//     govt in jurisdiction, admin/national, and the current titular
//     (role 'owner') of the subject pet; or
//   · an active member of the case's receiver organization — the refugio the
//     decomiso was handed to reads it in its transfer inbox, which does not go
//     through canReadCase.
//
// Everything else fails closed: an evidence row whose event has no case, or
// whose case cannot be loaded, is withheld. The rule only ever NARROWS what the
// pet readers used to show; nothing here makes evidence reachable to anyone who
// could not already sign it.

import { eq, inArray } from "drizzle-orm";

import { cases, db, petEvents } from "@/db";
import { isDecomisoEvidencePath } from "@/lib/infra/attachment-location";
import { canReadCase, isActiveOrgMember } from "@/lib/infra/case-access";
import { getCaseDetailByPublicCode } from "@/lib/infra/case-queries";
import { getJurisdictionsCached, getProfileCached } from "@/lib/infra/request-cache";

type AttachmentLike = { eventId: string | null; storagePath: string };

/**
 * `rows` minus the decomiso evidence `viewerUserId` may not read. Rows that are
 * not decomiso evidence pass through untouched, in order; with no evidence
 * among them this costs no query at all.
 */
export async function withholdUnreadableDecomisoEvidence<T extends AttachmentLike>(
  rows: readonly T[],
  viewerUserId: string | null,
): Promise<T[]> {
  const evidence = rows.filter((r) => isDecomisoEvidencePath(r.storagePath));
  if (evidence.length === 0) return [...rows];

  const readableEventIds = viewerUserId
    ? await readableEvidenceEventIds(
        [
          ...new Set(
            evidence.map((r) => r.eventId).filter((id): id is string => typeof id === "string"),
          ),
        ],
        viewerUserId,
      )
    : new Set<string>();

  return rows.filter(
    (r) =>
      !isDecomisoEvidencePath(r.storagePath) ||
      (r.eventId !== null && readableEventIds.has(r.eventId)),
  );
}

async function readableEvidenceEventIds(
  eventIds: string[],
  viewerUserId: string,
): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();

  const eventCases = await db
    .select({ eventId: petEvents.id, publicCode: cases.publicCode })
    .from(petEvents)
    .innerJoin(cases, eq(cases.id, petEvents.caseId))
    .where(inArray(petEvents.id, eventIds));
  if (eventCases.length === 0) return new Set();

  const profile = await getProfileCached(viewerUserId);
  if (!profile) return new Set();
  const viewer = {
    userId: profile.id,
    role: profile.role,
    jurisdictions: profile.role === "govt" ? await getJurisdictionsCached(profile.id) : [],
  };

  const verdictByCode = new Map<string, boolean>();
  const readable = new Set<string>();
  for (const { eventId, publicCode } of eventCases) {
    let verdict = verdictByCode.get(publicCode);
    if (verdict === undefined) {
      verdict = await viewerReadsDecomiso(publicCode, viewer);
      verdictByCode.set(publicCode, verdict);
    }
    if (verdict) readable.add(eventId);
  }
  return readable;
}

async function viewerReadsDecomiso(
  publicCode: string,
  viewer: Parameters<typeof canReadCase>[1] & object,
): Promise<boolean> {
  const detail = await getCaseDetailByPublicCode(publicCode);
  if (!detail) return false;
  if (await canReadCase(detail, viewer)) return true;
  return detail.receiverOrganization
    ? isActiveOrgMember(detail.receiverOrganization.id, viewer.userId)
    : false;
}
