// The chunked SecureStore adapter, driven through a fake keystore.
//
// WHY THIS FILE IS WORTH MORE THAN MOST
// ---------------------------------------------------------------------------
// Every bug this adapter can have presents as the SAME user-visible symptom —
// "the app logs me out sometimes" — and none of them can be reproduced on
// demand. A value one byte over the Android limit, a chunk that went missing, a
// write interrupted by the OS: all three end with a cold start on the sign-in
// screen and no error anywhere. That is a class of defect a test suite has to
// catch, because a QA pass will not.
//
// The fake below is deliberately dumb — a Map — and the ONE thing it enforces is
// the limit the real provider enforces: a value over 2048 bytes is refused. That
// is the whole reason chunking exists, so a fake that accepted anything would
// let the adapter pass while doing nothing.

import { describe, expect, it } from "@jest/globals";

import {
  CHUNK_SIZE,
  type SecureStorePort,
  createSecureStoreAuthStorage,
  parseHeader,
  sliceEnd,
  splitIntoChunks,
} from "./secure-store-auth-storage";

/** The Android Keystore provider's hard per-value limit. */
const ANDROID_LIMIT_BYTES = 2048;

function utf8Length(value: string): number {
  // TextEncoder is present in Hermes and in Node; measuring rather than
  // assuming is the point of the fake.
  return new TextEncoder().encode(value).length;
}

type FakeStore = SecureStorePort & {
  map: Map<string, string>;
  reads: string[];
  writes: string[];
};

function fakeSecureStore(options: { failOn?: (key: string) => boolean } = {}): FakeStore {
  const map = new Map<string, string>();
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    map,
    reads,
    writes,
    async getItemAsync(key) {
      reads.push(key);
      if (options.failOn?.(key)) throw new Error(`keystore unavailable for ${key}`);
      return map.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      writes.push(key);
      if (utf8Length(value) > ANDROID_LIMIT_BYTES) {
        throw new Error(
          `SecureStore: value for ${key} is ${utf8Length(value)} bytes, over the ${ANDROID_LIMIT_BYTES}-byte limit`,
        );
      }
      map.set(key, value);
    },
    async deleteItemAsync(key) {
      map.delete(key);
    },
  };
}

/** A session-shaped value of roughly `bytes` bytes. */
function sessionOfSize(bytes: number): string {
  const filler = "a".repeat(Math.max(0, bytes - 64));
  return JSON.stringify({ access_token: filler, refresh_token: "r".repeat(48) });
}

const KEY = "mimar.auth.session";

describe("splitIntoChunks", () => {
  it("keeps every chunk inside the Android byte limit for ASCII", () => {
    for (const chunk of splitIntoChunks(sessionOfSize(8_000))) {
      expect(utf8Length(chunk)).toBeLessThanOrEqual(ANDROID_LIMIT_BYTES);
    }
  });

  it("keeps every chunk inside the limit for three-byte characters", () => {
    // The bound in the header is 3 UTF-8 bytes per BMP code unit. This is that
    // arithmetic, measured: 512 units of a 3-byte character is 1536 bytes.
    const dense = "漢".repeat(CHUNK_SIZE * 4);
    for (const chunk of splitIntoChunks(dense)) {
      expect(utf8Length(chunk)).toBeLessThanOrEqual(ANDROID_LIMIT_BYTES);
    }
  });

  it("never splits a surrogate pair", () => {
    // An emoji is two UTF-16 code units. Slicing between them would leave each
    // chunk holding an unpaired surrogate — not valid UTF-8, and something a
    // native keychain is entitled to reject or mangle.
    const emoji = "🐕".repeat(CHUNK_SIZE);
    for (const chunk of splitIntoChunks(emoji)) {
      expect(chunk.length % 2).toBe(0);
      expect(chunk).toBe(chunk.normalize());
      expect(/[\uD800-\uDBFF]$/.test(chunk)).toBe(false);
    }
    expect(splitIntoChunks(emoji).join("")).toBe(emoji);
  });

  it("nudges the boundary back exactly one unit when it lands mid-pair", () => {
    const value = `${"a".repeat(CHUNK_SIZE - 1)}🐕tail`;
    expect(sliceEnd(value, 0, CHUNK_SIZE)).toBe(CHUNK_SIZE - 1);
  });
});

describe("round trip", () => {
  it("stores and returns a value larger than the 2048-byte limit", async () => {
    // THE CASE THE WHOLE FILE EXISTS FOR. A Supabase session with app_metadata
    // routinely crosses 2 KB, and the real provider REFUSES the write — silently
    // enough that the symptom is a mystery sign-out days later.
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    const value = sessionOfSize(6_000);

    await storage.setItem(KEY, value);
    expect(await storage.getItem(KEY)).toBe(value);
    // It really was chunked, not squeezed through in one write.
    expect(store.map.has(`${KEY}.c0`)).toBe(true);
    expect(store.map.has(`${KEY}.c1`)).toBe(true);
  });

  it("round-trips a small value too, through the same code path", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, "tiny");
    expect(await storage.getItem(KEY)).toBe("tiny");
  });

  it("round-trips an empty string as an empty string, not as null", async () => {
    // `null` means "no session". A value that is genuinely empty must not become
    // one, or the library would read a stored empty session as no session and
    // never notice it failed to write.
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, "");
    expect(await storage.getItem(KEY)).toBe("");
  });

  it("round-trips non-ASCII content intact", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    const value = JSON.stringify({ name: "Ñandú 🐕 acentuación", pad: "ó".repeat(3_000) });
    await storage.setItem(KEY, value);
    expect(await storage.getItem(KEY)).toBe(value);
  });

  it("writes the header LAST so an interrupted write cannot promise missing chunks", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(4_000));
    expect(store.writes[store.writes.length - 1]).toBe(KEY);
  });
});

describe("corruption is a signed-out user, never a crash", () => {
  it("treats a MISSING chunk as no session", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(6_000));

    store.map.delete(`${KEY}.c1`);

    // Not a throw, not a truncated string handed to JSON.parse: null.
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("cleans up after itself when it finds a hole", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(6_000));
    store.map.delete(`${KEY}.c1`);

    await storage.getItem(KEY);

    // The next cold start must not pay the same scan, and half a credential
    // must not linger in the Keystore.
    expect([...store.map.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
  });

  it("treats a length mismatch — the interrupted-write signature — as no session", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(6_000));

    // A header from the OLD value in front of chunks from the NEW one. The
    // chunks are all present, so only the declared length catches this.
    const header = parseHeader(store.map.get(KEY) ?? "");
    expect(header).not.toBeNull();
    store.map.set(KEY, `dim.chunked.v1:${header?.chunkCount}:999999`);

    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("returns null instead of throwing when the keystore itself fails", async () => {
    // A device with no passcode, a corrupted entry after an OS upgrade. The user
    // gets the sign-in screen; they do not get an app that will not start.
    const store = fakeSecureStore({ failOn: (key) => key === KEY });
    const storage = createSecureStoreAuthStorage(store);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it("hands back a plain value written by something that is not this adapter", async () => {
    const store = fakeSecureStore();
    store.map.set(KEY, "a-value-with-no-header");
    const storage = createSecureStoreAuthStorage(store);
    expect(await storage.getItem(KEY)).toBe("a-value-with-no-header");
  });
});

describe("removal leaves nothing behind", () => {
  it("deletes the header and every chunk", async () => {
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(6_000));

    await storage.removeItem(KEY);

    expect([...store.map.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
  });

  it("deletes orphans left by a previously LONGER value", async () => {
    // The cost the seam named when it chose chunking. Paid here, and asserted:
    // an orphan chunk is unreachable through the new header but is still a
    // credential's bytes sitting in the Keystore.
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(8_000));
    const longChunkCount = [...store.map.keys()].filter((k) => k.startsWith(`${KEY}.c`)).length;
    expect(longChunkCount).toBeGreaterThan(2);

    await storage.setItem(KEY, "short");

    const remaining = [...store.map.keys()].filter((k) => k.startsWith(`${KEY}.c`));
    expect(remaining).toEqual([`${KEY}.c0`]);
    expect(await storage.getItem(KEY)).toBe("short");
  });

  it("still clears everything when the header is unreadable", async () => {
    // Signing out is exactly when the stored state is most likely to be broken.
    const store = fakeSecureStore();
    const storage = createSecureStoreAuthStorage(store);
    await storage.setItem(KEY, sessionOfSize(6_000));
    store.map.set(KEY, "garbage");

    await storage.removeItem(KEY);

    expect([...store.map.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
  });
});

describe("parseHeader", () => {
  it("accepts our header and reads both numbers", () => {
    expect(parseHeader("dim.chunked.v1:3:1200")).toEqual({ chunkCount: 3, charLength: 1200 });
  });

  it("rejects anything that is not one, so a plain value is returned verbatim", () => {
    for (const raw of ["", "{}", "dim.chunked.v1:", "dim.chunked.v1:x:1", "dim.chunked.v1:1:2:3"]) {
      expect(parseHeader(raw)).toBeNull();
    }
  });
});
