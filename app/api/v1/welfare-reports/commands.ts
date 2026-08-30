// Filing a citizen denuncia from the phone: the act, and its refusals.
//
// IT IS AN ADAPTER OVER THE WEB'S OWN WRITER, AND IT RE-DERIVES NOTHING
// ---------------------------------------------------------------------------
// `createWelfareReport` (src/modules/welfare/application) is the use-case
// `/denuncias/nueva` drives through `createWelfareReportAction`. This file does
// what that action does around it — resolve the jurisdiction, insert the row,
// call the use-case — and NOTHING that action does not. Every guard below is a
// copy of a call site, not a re-derivation:
//
//   • the per-user rate-limit budget is `welfare_auth`, the SAME bucket and the
//     SAME 10/hr the browser spends. A ceiling a caller escapes by opening a
//     browser is not a ceiling.
//   • the jurisdiction is resolved through `resolveRoutableJurisdiction`, so a
//     phone denuncia lands in the same queue with the same `unverified` mark the
//     web's D.11 geocoder-down fallback produces.
//   • no `audit_log` row. Spec R1: the public create writes none, on either
//     door, and this one does not become the exception because it authenticated.
//   • the geocoder's three throwing paths are CAUGHT, which is what
//     `components/LocationFields.tsx` does around the same action. This one was
//     the sentence above being false: the call had been copied without the
//     try/catch that the web wraps it in, so a nominatim outage escaped the
//     handler as a bare 500. Fixed at `resolve_location` with the reasoning
//     beside it.
//
// THE ANONYMITY RULE, WHICH IS THE ONE THING THIS FILE OWNS
// ---------------------------------------------------------------------------
// `reporterUserId` is `null` for the whole anonymous branch, and the branch is
// taken from the DISCRIMINATOR rather than from a boolean beside the data. That
// null then propagates, by construction rather than by remembering:
//
//   welfare_reports.reporter_user_id  → null   (nothing links the row to the account)
//   cases.opened_by_user_id           → null   (the case names no opener)
//   pet_events.recorded_by_user_id    → null   (unreachable here, see below)
//
// PO decision 2026-07-08 is the reason a LOGGED-IN person may be anonymous at
// all: "honor 'Enviar anónima' completely — a logged-in user who chooses
// anonymous is NOT linked to the report", consistent with the
// finder-in-possession precedent. This door is the same decision on a transport
// where the caller is ALWAYS logged in, so it is the only mode that matters
// here.
//
// AND HERE IS WHAT THIS TRANSPORT CANNOT PROMISE, SAID PLAINLY. The bearer token
// identifies the caller to the SERVER on every request. What "anonymous" means
// on this door is that the RECORD does not carry them — not that the request was
// unattributable in flight. The web can be both (a signed-out browser sends no
// session at all); a `/api/v1` door cannot, because every one of them
// authenticates before it does anything. A person who needs the stronger
// property has the browser, and the screen says so.
//
// WHY THERE IS NO `registered_pet` SUBJECT, AND WHY THAT ALSO REMOVES A LOG
// ---------------------------------------------------------------------------
// `@dim/contract/input`'s `welfare-report.ts` drops that member: naming a
// registered animal means sending its public token, which is printed on the tag
// and published for every lost animal on `/perdidas`. Two consequences here:
// `subjectPetId` is always null, so the pet-event bridge inside the use-case
// never fires — and `isOwnerOfSubjectPet` is always false, which means this door
// cannot even ASK whether the caller owns the animal. On the web that question
// is asked and then deliberately suppressed for anonymous reporters; here there
// is nothing to suppress.
//
// FLAG HEURISTICS: THREE OF FIVE, AND THE TWO MISSING ONES ARE MISSING HONESTLY
// ---------------------------------------------------------------------------
// `computeFlagReasons` runs for anonymous submissions only — the web's rule,
// copied — and it is fed no `dwellTimeMs` and no honeypot value, because both
// measure a browser and a native client would have to invent them. It keeps
// `trivial_description`, `critical_without_evidence` and `duplicate_within_24h`,
// all derived from the submission itself. `critical_without_evidence` fires on
// every `critical` denuncia from this door, since `attachmentCount` is
// structurally 0 — that is correct rather than a false positive: a critical
// report with no evidence IS the thing that rule flags for a human to look at,
// and the phone genuinely cannot attach any.

import { db } from "@/db";
import { signalWelfareReport } from "@/lib/domain/authority";
import { writePoint } from "@/lib/domain/location";
import { apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { openCase } from "@/lib/infra/case-helpers";
import { resolveRoutableJurisdiction } from "@/lib/infra/jurisdiction-from-text";
import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { computeFlagReasons } from "@/lib/infra/welfare-moderation";
import { geocodeAddressPublicAction } from "@/src/modules/localities/application/geocoding/geocoding";
import { createWelfareReport } from "@/src/modules/welfare/application/create-welfare-report";
import { generateReferenceCode } from "@/src/modules/welfare/domain/reference-code";
import { WELFARE_REPORT_KINDS } from "@/src/modules/welfare/domain/types";
import { WelfareRepository } from "@/src/modules/welfare/infrastructure/welfare-repository";
import type { WelfareReportCommandInput, WelfareReportInput } from "@dim/contract/input";

import { buildWelfareLocationResolvedAck, buildWelfareReportFiledAck } from "./payload";

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/** The 503 this endpoint answers when the write cannot be attempted. */
export function unavailable() {
  return apiV1Error("temporarily_unavailable", 503, {
    "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
  });
}

/**
 * The per-USER budget, and it is the WEB'S.
 *
 * `createWelfareReportAction` spends `enforceRateLimit("welfare_auth", user.id,
 * { maxPerHour: 10 })` for an authenticated submission. The same bucket name and
 * the same ceiling are spent here so the browser and the phone share ONE budget
 * for one act — the rule `me/pet-claims` states about `claim_lookup` and
 * `me/privacy` states about the two ARCO rights.
 *
 * IT IS NOT ONE OF `api-v1-limits.ts`'s FAMILIES, deliberately. Those constants
 * size a ceiling against "how many app-holders sit behind one carrier gateway";
 * this one is keyed on a user id, it predates this surface, and it belongs to the
 * ACT. Adding `API_V1_AUTHENTICATED_WRITE_USER_LIMIT` (10/min) on top would make
 * the phone six times looser per minute and four times tighter per hour than the
 * browser, for the same denuncia.
 */
const WELFARE_AUTH_USER_LIMIT = { maxPerHour: 10 } as const;

export type WelfareReportCommandContext = {
  userId: string;
  input: WelfareReportCommandInput;
};

const repo = new WelfareRepository();

/**
 * How many candidate points `resolve_location` hands back.
 *
 * The geocoder returns up to five; the web's field renders all of them in a
 * list. This takes the same five rather than one, and the difference from the
 * web is what happens with a SINGLE match: `LocationFields` auto-picks it and
 * says "Ajustá el pin si no es el punto exacto" — an escape hatch that needs a
 * map. With no map, auto-picking would be choosing a point on somebody's behalf
 * and giving them no way to disagree, on a filing routed to an authority. So one
 * match is still a list of one, and it is still tapped.
 */
const MAX_LOCATION_MATCHES = 5;

/** Route the two commands. */
export async function runWelfareReportCommand(ctx: WelfareReportCommandContext) {
  if (ctx.input.command === "resolve_location") {
    // NO `welfare_auth` HERE. That budget is ten denuncias an hour and this is
    // not a denuncia — spending it on address lookups would let somebody who
    // mistyped a street four times find themselves unable to REPORT. What bounds
    // this command is the web's own `geocode_public` bucket (60/min + 400/hr per
    // IP), spent inside `geocodeAddressPublicAction`, plus the route's per-IP
    // bucket that already ran.
    //
    // THE GEOCODER THROWS AND THIS IS WHERE IT IS CAUGHT. `geocodeAddress` has
    // three throwing paths — `rate_limited` (its own token bucket, which is NOT
    // the `geocode_public` one above), `fetch_failed` (the nominatim timeout) and
    // `provider_error` (any non-2xx) — and `geocodeAddressPublicAction` re-throws
    // all three. Uncaught, they escape `route.ts`, which does not wrap this call
    // either, and Next answers a bare 500 with no `{ error }` envelope at all:
    // the one shape every `/api/v1` failure is required to have, missing on the
    // only path this phone can turn an address into a point.
    //
    // A FAILURE IS NOT AN EMPTY LIST, and collapsing the two would be the more
    // tempting fix. It is the wrong one: the screen renders `matches: []` as "no
    // encontramos esa dirección", so a nominatim outage would tell somebody
    // standing in front of an injured animal that the street they are looking at
    // does not exist, and they would retype it until they gave up. That is an
    // infrastructure failure wearing the costume of a user error. 503 says the
    // true thing, the mobile client already has es-AR copy for it ("El servidor
    // no pudo responder. Volvé a intentar en unos segundos."), and it carries a
    // `retry-after`.
    //
    // IT IS ALSO WHAT THE WEB'S CALL SITE DOES, which is the rule this file's
    // header states about every other guard on it: `components/LocationFields.tsx`
    // wraps the same action and sets `geocodeMessage` to `"failed"`, a state it
    // keeps DISTINCT from the `"empty"` it sets for a zero-length result. This
    // door had copied the call and not the try/catch around it.
    let matches: Awaited<ReturnType<typeof geocodeAddressPublicAction>>;
    try {
      matches = await geocodeAddressPublicAction(ctx.input.addressText);
    } catch (err) {
      // NO ADDRESS IN THE SINK. Spec D10 forbids logging what the person typed,
      // and a geocoder failure is the one place it would be most tempting to
      // attach for debugging.
      reportError("api-v1-welfare-reports/geocode", err);
      return unavailable();
    }
    return apiV1Json(buildWelfareLocationResolvedAck(matches.slice(0, MAX_LOCATION_MATCHES)), {
      status: 200,
    });
  }
  return fileWelfareReport(ctx.userId, ctx.input);
}

/**
 * File the denuncia.
 *
 * The order matches the web's action exactly and the order is load-bearing:
 * budget → jurisdiction → insert the row (outside the tx, so the reference code
 * exists before anything can reference it) → the atomic case/link tx. A failure
 * of the last step leaves a `welfare_reports` row with no case, which is the
 * state the web already produces and which `/gob/denuncias` already handles.
 */
async function fileWelfareReport(userId: string, input: WelfareReportInput) {
  if (!(await spendUserBudget(userId))) return apiV1Error("rate_limited", 429);

  // THE RULE IS THE DOMAIN'S, and the schema's copy is the client's convenience.
  // `@dim/contract` may not import `@/src`, so the nine kinds exist in both
  // places; this re-check is what makes the SERVER's answer come from the
  // domain catalogue rather than from the wire vocabulary. Same arrangement as
  // `me/pet-claims`, where the 15-digit rule is checked in the schema AND in
  // both use-cases, and the use-case's copy is the one that governs.
  if (!(WELFARE_REPORT_KINDS as readonly string[]).includes(input.kind)) {
    return apiV1Error("invalid_request", 400);
  }

  // ANONYMOUS IS THE DEFAULT DIRECTION OF THIS TERNARY, and it reads off the
  // discriminator rather than off a flag. There is no branch below in which an
  // anonymous submission can pick up a user id.
  const reporterUserId = input.contactMode === "anonymous" ? null : userId;
  const reporterContactEmail =
    input.contactMode === "with_contact" ? input.reporterContactEmail : null;
  const reporterContactPhone =
    input.contactMode === "with_contact" ? input.reporterContactPhone : null;

  const point = writePoint({ lat: input.locationLat, lng: input.locationLng });

  // D.11, copied from both of the web's intakes: a null province makes the row
  // invisible to every govt queue, so recover one from the address text and MARK
  // IT UNVERIFIED. The mark is not bookkeeping — the triage row renders it.
  //
  // The phone sends coordinates and no geocoder result, so `province` is always
  // null here and this always takes the inference path. That is the same shape
  // the web hits when nominatim is unreachable, which is why the mark is right:
  // the jurisdiction really was read out of text.
  const routable = await resolveRoutableJurisdiction({
    province: null,
    locality: null,
    localityId: null,
    addressText: input.locationAddress,
  });

  let inserted: { id: string; referenceCode: string };
  try {
    inserted = await repo.insertReportWithRetry(
      {
        reporterUserId,
        reporterContactEmail,
        reporterContactPhone,
        kind: input.kind as Parameters<typeof repo.insertReportWithRetry>[0]["kind"],
        severity: input.severity as Parameters<typeof repo.insertReportWithRetry>[0]["severity"],
        description: input.description,
        subjectKind: input.subjectKind as Parameters<
          typeof repo.insertReportWithRetry
        >[0]["subjectKind"],
        subjectPetId: null,
        subjectDescription: input.subjectDescription,
        locationAddress: input.locationAddress,
        jurisdictionProvince: routable.province,
        jurisdictionLocality: routable.locality,
        localityId: routable.localityId,
        jurisdictionUnverified: routable.unverified,
        locationLat: point.locationLat,
        locationLng: point.locationLng,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
        referenceCode: generateReferenceCode(),
      },
      undefined,
      generateReferenceCode,
    );
  } catch (err) {
    // NO `err` IN THE LOG LINE'S SUBJECT, and no report id — there is none yet.
    // `reportError` is the shared sink; what it must never receive from this
    // file is the caller's id or their free text.
    reportError("api-v1-welfare-reports/insert", err);
    return apiV1Error("welfare_report_failed", 500);
  }

  const result = await createWelfareReport(
    {
      reportId: inserted.id,
      referenceCode: inserted.referenceCode,
      kind: input.kind,
      severity: input.severity,
      description: input.description,
      subjectKind: input.subjectKind,
      // Both null on every request this door can make — see the header.
      subjectPetId: null,
      isOwnerOfSubjectPet: false,
      subjectDescription: input.subjectDescription,
      locationAddress: input.locationAddress,
      jurisdictionProvince: routable.province,
      jurisdictionLocality: routable.locality,
      locationLat: point.locationLat,
      locationLng: point.locationLng,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
      reporterContactEmail,
      reporterContactPhone,
      // ALWAYS NULL, and the field stays in the call rather than being dropped
      // from the use-case's input: `createWelfareReport` is the WEB's writer too
      // and its signature is not this door's to narrow. What this door has is
      // nothing to put there — the wire shape carries no symptoms field, because
      // the only consumer of one is a bridge that needs a registered pet. See
      // `@dim/contract/input`'s `welfare-report.ts`.
      observedSymptoms: null,
      // NO ATTACHMENTS. Not "none were sent" — none can be. See the contract.
      attachments: [],
      uploadedPaths: [],
      reporterUserId,
      // The two browser instruments this transport refuses to fake.
      dwellTimeMs: undefined,
      honeypotValue: "",
      clientIdempotencyKey: input.clientIdempotencyKey,
    },
    {
      repo,
      openCase: async (args) => openCase(args as Parameters<typeof openCase>[0]),
      computeFlagReasons,
      signal: async (opts) => {
        await signalWelfareReport(opts);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) {
    // The use-case's failure arm is es-AR PROSE about attachments — the only
    // sentence it can return, and it is written for a form. It is deliberately
    // NOT forwarded: this door sends no attachments, so the sentence would be
    // false, and `me/appointments/commands.ts` already records what matching on
    // prose costs. The report row EXISTS at this point (the insert is outside
    // the tx, matching the web); what failed is the case that should have been
    // opened over it.
    reportError("api-v1-welfare-reports/case", new Error("welfare case tx failed"));
    return apiV1Error("welfare_report_failed", 500);
  }

  // THE ACK IS BUILT FROM THE REFERENCE CODE AND NOTHING ELSE, and the builder
  // takes no other argument so a later edit cannot widen it without changing a
  // signature somebody has to look at.
  return apiV1Json(buildWelfareReportFiledAck(result.referenceCode), { status: 201 });
}

/**
 * Spend the shared per-user denuncia budget. `true` → proceed.
 *
 * FAILS OPEN on limiter infrastructure failure, like every sibling on this
 * surface, and the direction is the one this act demands: the limiter is itself
 * a database write, and a `rate_limit_buckets` outage must not stand between a
 * person watching an animal being hurt and the report of it. The abuse this
 * bounds is a flood of low-quality denuncias, which the moderation queue is the
 * real instrument against — `computeFlagReasons` and `/admin/moderacion` — and a
 * limiter outage does not disable either.
 *
 * THE CONTRAST IS `me/privacy`'s EXPORT, which fails CLOSED because a limiter
 * outage there would be an unbounded PII dump. Nothing leaves the server here.
 */
async function spendUserBudget(userId: string): Promise<boolean> {
  try {
    await enforceRateLimit("welfare_auth", userId, WELFARE_AUTH_USER_LIMIT);
    return true;
  } catch (err) {
    if (err instanceof RateLimitError) return false;
    reportError("api-v1-welfare-reports/welfare_auth", err);
    return true;
  }
}
