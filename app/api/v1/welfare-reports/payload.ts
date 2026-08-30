// The receipt for a filed denuncia — one function, one argument.
//
// THE SIGNATURE IS THE FENCE. Every other `payload.ts` on this surface takes a
// row and projects it, which means widening the ack is a matter of reading one
// more column off an object that is already in scope. This one takes a STRING,
// so there is nothing else in the function to leak: adding the reporter's
// contact, the status, the coordinates or the report's uuid to this response
// requires changing a signature and every one of its callers, in a diff a
// reviewer sees.
//
// That is the same instrument `lookup-pet-for-denuncia.ts` reaches for when it
// says a privacy property should be STRUCTURAL — "an anonymous caller cannot be
// leaked what the query never selects" — applied one layer out.

import { resolveSiteUrl } from "@/lib/infra/site-url";
import { WELFARE_REPORT_PAYLOAD_VERSION, type WelfareReportFiledV1 } from "@dim/contract/api";
import { deepLinkUrl } from "@dim/contract/links";

/**
 * `DEN-XXXX-XXXX` → the receipt the phone shows.
 *
 * `followUpUrl` goes through `deepLinkUrl` rather than being interpolated, for
 * the reason `claimSightingUrl` states about itself: a rename of the web path is
 * then a compile error against `DEEP_LINK_MAP` instead of a 404 nobody notices.
 * The entry (`welfareReport` → `/denuncias/codigo/:referenceCode`) already
 * existed; this is its first server-side user.
 */
export function buildWelfareReportFiledAck(referenceCode: string): WelfareReportFiledV1 {
  return {
    version: WELFARE_REPORT_PAYLOAD_VERSION,
    referenceCode,
    followUpUrl: deepLinkUrl(resolveSiteUrl(), "welfareReport", { referenceCode }),
  };
}
