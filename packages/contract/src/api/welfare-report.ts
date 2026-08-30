// `POST /api/v1/welfare-reports` — what a filed denuncia answers.
//
// THE ACK IS THREE FIELDS AND THE SHORTNESS IS THE DESIGN
// ---------------------------------------------------------------------------
// A denuncia under Ley 14.346 is an unverified allegation of a crime against a
// person the reporter has just described. Every field this shape could carry —
// the accused's description, the locality, the coordinates, the status of the
// investigation — is a field about THAT person, echoed back over a transport a
// screenshot travels on. `/denuncias/codigo/[code]` was rewritten in exactly
// this direction and its header is the argument: "Existence + the date + a
// door. Nothing else."
//
// So the ack echoes NONE of the request. Not the description, not the kind, not
// the coordinates the client just sent. A client that wants to show a summary
// already holds one — it is the form the person just filled in — and an echo
// would only add a second copy of an accusation to a response body.
//
// THE REFERENCE CODE IS AN IDENTIFIER AND NOT A CREDENTIAL, AND THIS WAS ONCE
// THE OTHER WAY ROUND
// ---------------------------------------------------------------------------
// `DEN-XXXX-XXXX` used to be both: any holder of the string was served the
// reporter's free text, the description of the accused, a map point and signed
// URLs to the evidence. `lib/infra/denuncia-reporter-token.ts` exists because
// that was wrong, and it moved the CAPABILITY onto a separate token with three
// properties the code does not have — it binds to a subject rather than a case,
// it is a second factor minted into an address already on the record, and it
// expires in thirty minutes.
//
// What the code opens today is `/denuncias/codigo/{code}`, which confirms the
// denuncia exists, shows the date, and offers to prove you are the denunciante.
// That is why it is safe to hand back over JSON: it is the receipt number, not
// the file.
//
// It is ALSO why this ack does not pretend the phone can follow the case. A
// bearer client has no cookie jar the server can mint a reporter session into,
// and `mintFreshReporterSession` writes an httpOnly cookie. The honest answer is
// the code plus the browser, and `followUpUrl` is that door rather than a
// promise this transport cannot keep.
//
// WHAT IS NOT HERE, ENUMERATED, BECAUSE AN ABSENCE IS EASY TO ADD BACK
// ---------------------------------------------------------------------------
//   • No `reportId`. The uuid is the operator-side handle and it is what the
//     reporter session cookie is keyed on; a client that never needs it must
//     never hold it.
//   • No `status`. `/denuncias/codigo` withholds it deliberately — status is
//     process information about an investigation into a person named in the
//     file — and a phone is not a more private screen than a browser.
//   • No `caseId` and no `casePublicCode`. The case belongs to the authority.
//   • NOTHING ABOUT THE REPORTER. Not a name, not the contact they left, not
//     even whether the submission was anonymous. See `WelfareReportFiledV1`.

/**
 * Bumped when a field is REMOVED or its meaning changes; adding one does not
 * bump it. Same rule as every other payload in this package.
 */
export const WELFARE_REPORT_PAYLOAD_VERSION = 1;

/**
 * The receipt for a filed denuncia.
 *
 * IT IS IDENTICAL FOR AN ANONYMOUS AND A NAMED SUBMISSION, byte for byte, and
 * that is the load-bearing property of this file rather than an economy.
 *
 * The temptation is a field like `anonymous: true` or `followUp: "email"` — it
 * reads as helpful, the client "already knows" what it sent, and it costs
 * nothing. It costs this: the response body becomes a place where the server
 * states, in writing, whether the person holding this phone is attached to this
 * denuncia. That body is logged by proxies, cached by clients, and screenshotted
 * by people. The one thing this lane exists to protect is that the answer is
 * never written down anywhere it does not have to be, and a receipt does not
 * have to.
 *
 * `__tests__/api-v1-welfare-reports-route.test.ts` asserts the two acks are
 * deep-equal for the same submission under both contact modes, which is what
 * turns this paragraph into a fence.
 */
export type WelfareReportFiledV1 = {
  version: typeof WELFARE_REPORT_PAYLOAD_VERSION;
  /**
   * `DEN-XXXX-XXXX`. The receipt number — see the header for why handing it back
   * grants nothing on its own.
   */
  referenceCode: string;
  /**
   * The web page that code opens, absolute, so a client links rather than
   * builds. A hand-built `${origin}/denuncias/codigo/${code}` is a silent 404
   * the day the web renames the path, which is the argument
   * `claim-view-model.ts` makes about its own two functions and only half
   * follows.
   */
  followUpUrl: string;
};
