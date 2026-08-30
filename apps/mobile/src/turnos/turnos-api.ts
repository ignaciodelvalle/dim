// The two BUSCAR reads — and why they are not in `src/api/endpoints.ts` with the
// other twenty-eight.
//
// THIS FILE IS A DECLARED DEVIATION, NOT A PATTERN TO COPY
// ---------------------------------------------------------------------------
// `src/api/endpoints.ts`'s header states the rule these two break: "Every
// `/api/v1` call this app makes, in one file … a reader asking 'what can this app
// do to my account' should get the answer in one screen rather than by walking a
// directory." Two calls living here means that reader now has to walk one
// directory.
//
// It is here because that file was ANOTHER LANE'S TERRITORY in the window this
// landed in. `apps/mobile/src/api/endpoints.ts` is one of the five files the
// denunciar lane was turned back on — five content conflicts, every one of them
// the same append-at-the-end shape. Appending two more exports to it would have
// made that six, in the file whose whole value is being one file.
//
// THE MOVE IS MECHANICAL AND THE EXACT TEXT IS IN THE HAND-OFF. Both functions
// move verbatim; only the imports change (`./client`/`./error-copy` become
// relative to that file, which is where they already live).
//
// WHAT IS NOT HERE, AND DELIBERATELY: the BOOKING write. `sendAppointmentCommand`
// already exists in `endpoints.ts` and takes an `AppointmentCommandInput`, which
// the contract widened to admit `book` as a second member — so the write needed no
// new function at all, and adding one here would have created a second door onto
// one endpoint. That is the whole argument for the input union being
// discriminated, arriving on time.
//
// Everything here is a thin wrapper over `apiRequest`. No endpoint may add its
// own retry, its own error copy, or its own session handling — those live in
// `client.ts` exactly once, and a second copy is how two screens end up
// disagreeing about what a 401 means.

import {
  APPOINTMENT_SEARCH_PAYLOAD_VERSION,
  type AppointmentSearchV1,
  type BookableOfferingDetailV1,
} from "@dim/contract/api";

import { type ApiResult, type SessionPort, apiRequest } from "../api/client";

/**
 * `GET /appointments` — the service picker, or one service's results.
 *
 * TWO SHAPES ON ONE URL, and this wrapper does not split them: called with no
 * `serviceKind` the payload carries the twelve-row catalogue and no results,
 * which is what the picker screen draws. The web does the same on one URL and for
 * the same reason — a second endpoint for a twelve-item constant is a route, a
 * bucket and a payload version.
 *
 * A BEARER CALL, unlike `searchLocalities`, and that is not an oversight of the
 * "it is public on the web" kind. The endpoint requires a session (its own header
 * argues why: this app has no anonymous shell and an anonymous `/api/v1` read is
 * a different rate-limit derivation rather than a smaller one), so a
 * `performRequest` here would send a call the server refuses.
 *
 * THE PARAM NAMES ARE THE WEB'S, EXACTLY — `service_kind`, `province`,
 * `locality`, `fecha_desde`, `solo_gratis`. `snake_case` and one of them in
 * Spanish is not this file's taste; it is `/turnos/buscar`'s query string, and a
 * person who shares a search from the browser and one who shares it from the
 * phone should be describing the same thing.
 *
 * AN OMITTED FILTER IS NOT AN EMPTY ONE. A key is set only when it has a value,
 * because `?province=` is a request to search the empty-string province and
 * `?solo_gratis=false` is a string the server reads as "not true" — the same
 * three-way rule `saveMyProfile` states for its fields.
 */
export function fetchAppointmentSearch(
  session: SessionPort,
  query: {
    serviceKind?: string | null;
    province?: string | null;
    locality?: string | null;
    fechaDesde?: string | null;
    freeOnly?: boolean;
  } = {},
): Promise<ApiResult<AppointmentSearchV1>> {
  const params = new URLSearchParams();
  if (query.serviceKind) params.set("service_kind", query.serviceKind);
  if (query.province) params.set("province", query.province);
  if (query.locality) params.set("locality", query.locality);
  if (query.fechaDesde) params.set("fecha_desde", query.fechaDesde);
  if (query.freeOnly) params.set("solo_gratis", "true");
  const suffix = params.size === 0 ? "" : `?${params.toString()}`;

  return apiRequest<AppointmentSearchV1>(
    {
      path: `/api/v1/appointments${suffix}`,
      expectedPayloadVersion: APPOINTMENT_SEARCH_PAYLOAD_VERSION,
    },
    session,
  );
}

/**
 * `GET /appointments/{offeringToken}` — one offering, its slot grid, and which of
 * the caller's animals may take a place.
 *
 * `pets[].canBook` AND `blockedReason` ARE THE SERVER'S AND MUST NOT BE
 * RECOMPUTED. The rule behind them is the writer's — one confirmed appointment per
 * (pet, offering), re-checked inside the booking transaction and backed by a
 * partial unique index — and it is invisible in a slot grid. A screen that derived
 * eligibility from the slots alone would draw a button the write throws away.
 *
 * `pets` MAY BE EMPTY and that is not an error: it is a person with no animal
 * registered yet, and the screen sends them to the alta form. It must NOT be
 * rendered as "no encontramos tus mascotas".
 *
 * A 404 COVERS "NOT APPROVED" as well as "no such token", deliberately, so this
 * URL is not an oracle for which offerings exist and which are merely switched
 * off. A caller must not turn the two into different sentences.
 */
export function fetchBookableOffering(
  session: SessionPort,
  offeringToken: string,
): Promise<ApiResult<BookableOfferingDetailV1>> {
  return apiRequest<BookableOfferingDetailV1>(
    {
      path: `/api/v1/appointments/${encodeURIComponent(offeringToken)}`,
      expectedPayloadVersion: APPOINTMENT_SEARCH_PAYLOAD_VERSION,
    },
    session,
  );
}
