// The three calls behind one photo, and the ONE of them that is not a
// `/api/v1` request.
//
// WHAT THIS FILE HAS TO PROVE
// ---------------------------------------------------------------------------
//   1. `uploadPetPhotoBytes` NEVER ENDS THE SESSION. It talks to Supabase
//      Storage, not to us, and a 401 from that origin means "this ticket is
//      spent", not "this account is signed out". Routing it through
//      `apiRequest` would have signed a user out because a two-hour-old upload
//      URL went stale — the retry-loop class `client.ts`'s header describes.
//   2. IT ATTACHES NO BEARER. The capability is in the URL; sending the
//      account's access token to a third-party origin would be handing it out.
//   3. THE TWO API CALLS SEND THE COMMANDS THE CONTRACT DECLARES, to one URL.
//   4. NEITHER API CALL SENDS AN `Idempotency-Key`. The server does not read
//      one, and a client that sent it would believe it holds a guarantee
//      nobody made.

import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { SessionPort } from "../api/client";
import { confirmPetPhoto, requestPetPhotoTicket, uploadPetPhotoBytes } from "../api/endpoints";

const TOKEN = "DIM-PAMP-0001";
const STAGED = "22222222-2222-4222-8222-222222222222/333.jpg";

const ticket = {
  uploadUrl: "https://storage.test/object/upload/sign/uploads-staging/x?token=tok",
  token: "tok",
  stagedPath: STAGED,
  bucket: "uploads-staging",
  expiresInSeconds: 7200,
};

/** Every `endSession` call. Empty is the assertion that matters most here. */
const ended: string[] = [];

const session: SessionPort = {
  accessToken: async () => "access-token",
  refreshAccessToken: async () => "refreshed",
  endSession: async (reason) => {
    ended.push(reason);
  },
};

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function mockFetch(responder: (call: Call) => Response | Promise<Response> | Error): void {
  (globalThis as { fetch: unknown }).fetch = async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit };
    calls.push(call);
    const out = await responder(call);
    if (out instanceof Error) throw out;
    return out;
  };
}

/**
 * The one request that was made, or a throw naming what actually happened.
 *
 * `calls[0]` is `Call | undefined` under this app's tsconfig, and reaching for
 * `.url` on it does not compile. A non-null assertion would compile and then
 * fail with "cannot read url of undefined" the day a call stops being made —
 * this fails with the count instead.
 */
function onlyCall(): Call {
  if (calls.length !== 1) throw new Error(`expected exactly 1 request, saw ${calls.length}`);
  return calls[0] as Call;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  calls.length = 0;
  ended.length = 0;
  jest.restoreAllMocks();
});

describe("requesting a ticket", () => {
  it("posts the contract's command to the photo URL and returns the ticket", async () => {
    mockFetch(() => json(201, ticket));
    const result = await requestPetPhotoTicket(session, TOKEN, "image/jpeg");
    expect(result).toEqual({ outcome: "ok", payload: ticket });

    expect(calls).toHaveLength(1);
    expect(onlyCall().url).toContain(`/api/v1/pets/${TOKEN}/photo`);
    expect(JSON.parse(String(onlyCall().init.body))).toEqual({
      command: "request_ticket",
      contentType: "image/jpeg",
    });
  });

  it("sends no Idempotency-Key — the server reads none", async () => {
    mockFetch(() => json(201, ticket));
    await requestPetPhotoTicket(session, TOKEN, "image/webp");
    const headers = onlyCall().init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("idempotency-key");
  });
});

describe("uploading the bytes — the call that is NOT ours", () => {
  it("PUTs to the ticket's URL with NO bearer token", async () => {
    mockFetch(() => new Response(null, { status: 200 }));
    const result = await uploadPetPhotoBytes(ticket, new Blob(["x"]), "image/jpeg");
    expect(result).toEqual({ outcome: "ok" });

    expect(calls).toHaveLength(1);
    expect(onlyCall().url).toBe(ticket.uploadUrl);
    expect(onlyCall().init.method).toBe("PUT");
    // The account's access token must not reach a third-party origin. The
    // capability that authorises this write is the `?token=` in the URL.
    const headers = onlyCall().init.headers as Record<string, string>;
    const names = Object.keys(headers).map((k) => k.toLowerCase());
    expect(names).not.toContain("authorization");
    expect(headers["content-type"]).toBe("image/jpeg");
  });

  it("reads 400/401/403 as a DEAD TICKET and never ends the session", async () => {
    // ONE assertion over the whole table rather than three inside a loop:
    // jest's `expect` takes no message argument (that is vitest's), so a loop
    // that failed on the third status would report the same bare diff as one
    // that failed on the first. Collecting the outcomes and comparing the
    // TABLE puts the failing status in the diff itself.
    const outcomes: Array<[number, unknown]> = [];
    for (const status of [400, 401, 403]) {
      mockFetch(() => new Response(null, { status }));
      outcomes.push([status, await uploadPetPhotoBytes(ticket, new Blob(["x"]), "image/jpeg")]);
    }
    expect(outcomes).toEqual([
      [400, { outcome: "expired" }],
      [401, { outcome: "expired" }],
      [403, { outcome: "expired" }],
    ]);
    // THE ASSERTION THIS FILE EXISTS FOR. A stale upload URL is not a stale
    // session, and the two are different origins answering about different
    // things.
    expect(ended).toEqual([]);
  });

  it("reads a 5xx and a dead connection as retryable, and still ends nothing", async () => {
    mockFetch(() => new Response(null, { status: 503 }));
    expect(await uploadPetPhotoBytes(ticket, new Blob(["x"]), "image/png")).toEqual({
      outcome: "failed",
      detail: "HTTP 503",
    });

    mockFetch(() => new Error("Network request failed"));
    const offline = await uploadPetPhotoBytes(ticket, new Blob(["x"]), "image/png");
    expect(offline.outcome).toBe("failed");
    expect(ended).toEqual([]);
  });
});

describe("confirming", () => {
  it("posts the staged path back to the same URL", async () => {
    mockFetch(() => json(200, { photoUrl: "https://s.test/x.jpg", replacedPrevious: true }));
    const result = await confirmPetPhoto(session, TOKEN, STAGED);
    expect(result).toEqual({
      outcome: "ok",
      payload: { photoUrl: "https://s.test/x.jpg", replacedPrevious: true },
    });
    expect(onlyCall().url).toContain(`/api/v1/pets/${TOKEN}/photo`);
    expect(JSON.parse(String(onlyCall().init.body))).toEqual({
      command: "confirm",
      stagedPath: STAGED,
    });
  });

  it("surfaces `photo_not_an_image` as an api-error with its own copy", async () => {
    mockFetch(() => json(400, { error: "photo_not_an_image" }));
    const result = await confirmPetPhoto(session, TOKEN, STAGED);
    expect(result).toEqual({
      outcome: "api-error",
      code: "photo_not_an_image",
      retryAfterSeconds: null,
    });
    // A refused FILE is not a refused session.
    expect(ended).toEqual([]);
  });

  it("still ends the session on a 403 that says the ACCOUNT is gone", async () => {
    // The complement of the upload test: this call IS ours, so the session
    // policy applies to it exactly as it does to every other bearer call.
    mockFetch(() => json(403, { error: "account_erased" }));
    await confirmPetPhoto(session, TOKEN, STAGED);
    expect(ended).toEqual(["account_erased"]);
  });
});
