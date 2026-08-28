import "server-only";

// The pet-photo upload primitive — mint a ticket, then confirm the bytes.
//
// WHY THIS IS TWO STEPS AND NOT A SIGNED URL POINTED AT `pet-photos`
// ---------------------------------------------------------------------------
// This work unit was briefed as "signed uploads", and the repo's own
// architecture note refuses the obvious reading of that phrase.
// docs/architecture/api-invariants.md §1.5:
//
//     "native uploading direct-to-storage with a signed URL loses all three at
//      once [magic bytes, no-SVG, sharp re-encode]. No createSignedUploadUrl
//      exists anywhere today — every signed URL in the repo is a download.
//      Keep it that way, or replicate all three server-side first."
//
// A signed PUT straight into `pet-photos` would be exactly the refused thing:
// `pet-photos` is a PUBLIC bucket, `lib/infra/uploads.ts` re-encodes everything
// bound for it and fails CLOSED on a sharp error precisely so attacker-chosen
// bytes never sit behind a public URL, and a signed PUT has no server in the
// path to do either. It would be a REGRESSION against the web, dressed as
// parity with it.
//
// So the signed PUT lands in `uploads-staging` (migration 0206) — private,
// deny-all to caller roles, read by nothing — and this module's second half is
// RN-4 improvement #1's "post-upload verify step": fetch the staged bytes,
// decide by magic bytes whether they are an image at all, re-encode them, and
// write a normalised copy into `pet-photos`. Nothing may claim an unverified
// object, because the only thing that writes the `attachments` row is the code
// that just verified it.
//
// WHAT THE SIGNATURE PERMITS, STATED PLAINLY
// ---------------------------------------------------------------------------
// A ticket is a bearer capability. Whoever holds it may:
//   · write ONE object, at ONE exact key — not a prefix, not a directory;
//   · of at most `MAX_IMAGE_BYTES`, enforced by the bucket's `file_size_limit`,
//     which holds whether or not any of our code runs;
//   · declaring one of three content types, enforced by the bucket's
//     `allowed_mime_types` — a DECLARATION check, not a content check;
//   · into a private bucket nothing reads and no page links to;
//   · for two hours, a window `createSignedUploadUrl` fixes and does not let us
//     shorten (its signature takes a path and `{ upsert }` and nothing else).
//
// And what it does NOT permit: reading anything, writing anywhere else,
// overwriting an existing object (no `upsert`), or causing any of it to become
// a pet's photo. That last one is the point — the capability buys a staged blob
// and nothing more.
//
// WHAT THE SPINE RECORDS: NOTHING, AND THAT IS THE HONEST ANSWER
// ---------------------------------------------------------------------------
// Invariant #2 says events are append-only; invariant #3 says facts are
// event-sourced and caches declare themselves. A photo is neither a medical nor
// a custody lifecycle fact: the event catalog has no photo event
// (`packages/contract/src/events/event-types.ts`, 45 entries, checked), and the
// web has never written one — `pet_registered` carries `has_photo` as a
// BOOLEAN, which is a registration detail rather than a photo log.
//
// So the photo is CURATED METADATA, the third category invariant #3 names by
// hand: the `attachments` row IS the record and `pets.primary_photo_id` is the
// pointer to the current one. There is no spine entry it could be a cache of,
// and inventing a `photo_updated` event for the native door alone would make
// the two doors disagree about what the spine contains — which is worse than
// the gap it would close. If photo history is ever wanted it is wanted on BOTH
// doors, as its own change, with a migration and a catalog entry.
//
// WHAT ERASURE DOES WITH IT
// ---------------------------------------------------------------------------
// Nothing new, by construction, and that was a design constraint rather than a
// happy accident. `purgeOwnedPetAttachments` (erase-subject-data.ts) resolves
// the subject's owned pets, reads every `attachments` row keyed on those pets,
// infers the bucket from the row's shape (`event_id` null ⇒ `pet-photos`), and
// removes the objects and the rows. A photo written here is exactly that shape,
// so it is covered the day it lands. NO NEW TABLE — the fence
// `scripts/check-subject-rights-coverage.ts` has 21 tables in `KNOWN_GAP` and
// this change adds a 22nd to nobody's list.
//
// The staging bucket is the one thing that needed a hand: an abandoned staged
// object belongs to no `attachments` row and would have outlived the pet it was
// meant for. `purgeOwnedPetAttachments` now sweeps the `{petId}/` prefix too.

import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { attachments, pets } from "@/db/schema";
import { petPhotoUrl } from "@/lib/infra/storage";
import {
  MAX_IMAGE_BYTES,
  type RasterMime,
  detectRasterMime,
  rasterExtension,
  reencodeRaster,
} from "@/lib/media/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PetPhotoTicketV1, PetPhotoUpdatedV1 } from "@dim/contract/api";
import { and, eq, isNull } from "drizzle-orm";

/** The private bucket a ticket writes into. Declared by migration 0206. */
export const STAGING_BUCKET = "uploads-staging";

/** The public bucket a confirmed photo ends up in. */
export const PET_PHOTO_BUCKET = "pet-photos";

/**
 * The signed-upload window, in seconds.
 *
 * NOT A CHOICE. `@supabase/storage-js`'s `createSignedUploadUrl(path, options?)`
 * takes `{ upsert }` and nothing else, and its own docblock states the URLs
 * "are valid for 2 hours". This constant reports that fact so the payload can
 * tell a client the truth; it does not configure anything. If the SDK ever
 * exposes an expiry, this is the line that changes and the only one.
 */
export const TICKET_TTL_SECONDS = 2 * 60 * 60;

/**
 * The object key a ticket mints, and the ONLY shape `confirm` will accept.
 *
 * `{petId}/{uuid}.{ext}`:
 *   · the PREFIX is the pet's id, so confirm can re-derive it from the pet it
 *     just authorized and refuse a key belonging to any other pet. A caller
 *     cannot steer this — it never sends a pet id, it sends a public token that
 *     the access check resolves.
 *   · the LEAF is a fresh UUID with an extension derived from the declared
 *     content type, chosen from a closed list. No part of it comes from a client
 *     string, which is what keeps `../` and a guessable name out of the key at
 *     the same time. `lib/infra/uploads.ts` has derived its filename this way
 *     since it was written; this is the same rule with a prefix added.
 */
function stagedKeyFor(petId: string, mime: RasterMime): string {
  return `${petId}/${randomUUID()}.${rasterExtension(mime)}`;
}

/**
 * Does this staged key belong to this pet?
 *
 * The check is a PREFIX EQUALITY against a pet id the server resolved, not a
 * pattern match against something the caller said. That distinction is the
 * whole guard: a caller may send any string it likes as `stagedPath`, and the
 * only ones that survive are the ones whose first segment is the id of the pet
 * whose access check just passed.
 *
 * Exported so the test can exercise it directly — a guard reachable only
 * through a route is a guard that gets tested through a mock of itself.
 */
export function stagedPathBelongsToPet(stagedPath: string, petId: string): boolean {
  const slash = stagedPath.indexOf("/");
  if (slash <= 0) return false;
  if (stagedPath.slice(0, slash) !== petId) return false;
  const leaf = stagedPath.slice(slash + 1);
  // One segment after the prefix, and no traversal in it. The contract's zod
  // shape already refuses these; this refuses them again, HERE, because this is
  // the function that hands a path to the object store and a guard that relies
  // on a caller's schema having run is not a guard.
  return leaf.length > 0 && !leaf.includes("/") && !leaf.includes("..");
}

export type TicketResult =
  | { ok: true; ticket: PetPhotoTicketV1 }
  | { ok: false; code: "photo_failed" };

/**
 * Mint one upload ticket for one pet.
 *
 * THE CALLER MUST HAVE AUTHORIZED ALREADY. This function takes a `petId`, not a
 * public token, for the same reason `welfareAttachmentSignedUrl` takes no caller
 * client: it cannot check anything, so it must not look like it does. Calling it
 * is equivalent to handing out the capability described in the header.
 */
export async function mintPetPhotoTicket(
  petId: string,
  contentType: RasterMime,
): Promise<TicketResult> {
  const stagedPath = stagedKeyFor(petId, contentType);
  const { data, error } = await createAdminClient()
    .storage.from(STAGING_BUCKET)
    .createSignedUploadUrl(stagedPath);

  if (error || !data?.signedUrl || !data.token) {
    console.error("[pet-photo] could not mint an upload ticket", {
      petId,
      message: error?.message ?? "no signed url returned",
    });
    return { ok: false, code: "photo_failed" };
  }

  return {
    ok: true,
    ticket: {
      uploadUrl: data.signedUrl,
      token: data.token,
      stagedPath,
      bucket: STAGING_BUCKET,
      expiresInSeconds: TICKET_TTL_SECONDS,
    },
  };
}

export type ConfirmResult =
  | { ok: true; photo: PetPhotoUpdatedV1 }
  /**
   * `pet_gone` is the SOFT-DELETED animal, and it is not a contract code — the
   * route answers it as `not_found`, because under PO-4 an erased pet and a pet
   * that never existed are the same answer.
   *
   * IT IS NOT DEFENCE IN DEPTH; IT IS THE ONLY DEFENCE THERE IS.
   * `resolvePetHolderAccess` does not filter `pets.deleted_at` — measured, not
   * assumed — and `erase_subject_data` soft-deletes the PET while leaving the
   * `ownerships` row standing (`purgeOwnedPetAttachments` relies on exactly
   * that: "ownerships rows survive the RPC, only pets are soft-deleted"). So an
   * erased animal still resolves holder access, and without this check a photo
   * would be written onto it after its owner exercised art. 16.
   *
   * Found by `__tests__/public-soft-delete-resolution.test.ts`, whose rule is
   * that every module reachable from `app/api/v1/**` must carry the filter on
   * any read of `pets`. It was right.
   */
  | { ok: false; code: "pet_gone" }
  | { ok: false; code: "photo_not_an_image" | "photo_failed" };

/**
 * Turn a staged object into the pet's photo, or refuse it.
 *
 * The order of operations is load-bearing and each step is refusable:
 *
 *  1. THE PATH. Refuse anything whose prefix is not this pet's id. Done before
 *     any Storage call so a probe costs a caller a 400 and us nothing.
 *  2. THE BYTES. Download the staged object as service role — the bucket admits
 *     nobody else — and refuse a body over `MAX_IMAGE_BYTES`. The bucket's own
 *     `file_size_limit` should have refused the PUT, and this checks it again on
 *     the way out: a bucket limit is configuration, and configuration drifts.
 *  3. THE CONTENT. `detectRasterMime` over the actual bytes. THIS is the check
 *     that decides what the file is; the content type the ticket declared is a
 *     claim and was only ever used to pick an extension.
 *  4. THE RE-ENCODE. Through sharp, failing CLOSED. `pet-photos` is public, and
 *     `lib/infra/uploads.ts` states the rule this repeats: never serve
 *     un-normalised bytes from a public URL. The re-encode also drops EXIF,
 *     which on a phone photo means dropping the GPS coordinates of somebody's
 *     home.
 *  5. THE WRITE. A fresh key in `pet-photos` — derived again, from the mime the
 *     BYTES turned out to be, not the one the ticket carried.
 *  6. THE ROW, then the pointer. `attachments` first so `pets.primary_photo_id`
 *     never points at a row that does not exist.
 *  7. THE CLEANUP. The staged object goes on every path out of here, success or
 *     refusal. Best-effort: a Storage hiccup must not turn a saved photo into an
 *     error. What a crashed client leaves behind is a NAMED RESIDUAL — see
 *     migration 0206's lifecycle note: this repo has no storage GC for any
 *     bucket, so the staged object is bounded by the rate limiter and swept by
 *     erasure, not collected.
 *
 * WHAT IT DOES NOT DO: delete the photo it replaced. The previous
 * `attachments` row and its object stay. That is deliberate and it matches the
 * web, whose edit path also only re-points `primary_photo_id` — an owner who
 * replaces a photo by mistake has not destroyed the old one, and erasure sweeps
 * every row keyed on the pet regardless of which one is current. The cost is
 * storage, and it is named in RN-4 A9 as part of the GC work that is not this.
 */
export async function confirmPetPhoto(params: {
  petId: string;
  userId: string;
  stagedPath: string;
}): Promise<ConfirmResult> {
  const { petId, userId, stagedPath } = params;
  const admin = createAdminClient();

  if (!stagedPathBelongsToPet(stagedPath, petId)) {
    // NOT a distinct code. "That key is not yours" and "that key does not
    // exist" answer identically, or confirm becomes an oracle for which staged
    // keys exist — the same rule `/pets/{token}` applies to public tokens.
    return { ok: false, code: "photo_not_an_image" };
  }

  const discardStaged = async (): Promise<void> => {
    try {
      await admin.storage.from(STAGING_BUCKET).remove([stagedPath]);
    } catch (err) {
      console.warn("[pet-photo] could not discard the staged object", {
        stagedPath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  let bytes: Buffer;
  try {
    const { data, error } = await admin.storage.from(STAGING_BUCKET).download(stagedPath);
    if (error || !data) {
      await discardStaged();
      return { ok: false, code: "photo_not_an_image" };
    }
    bytes = Buffer.from(await data.arrayBuffer());
  } catch (err) {
    console.error("[pet-photo] could not read the staged object", {
      stagedPath,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, code: "photo_failed" };
  }

  // Re-checked here even though the bucket declares the same ceiling: the
  // bucket limit is configuration on a remote service, and this is the last
  // point at which we are the ones deciding.
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    await discardStaged();
    return { ok: false, code: "photo_not_an_image" };
  }

  const detected = detectRasterMime(bytes);
  if (!detected) {
    await discardStaged();
    return { ok: false, code: "photo_not_an_image" };
  }

  let normalised: Buffer;
  try {
    normalised = await reencodeRaster(bytes);
  } catch (err) {
    // FAILS CLOSED. `pet-photos` is public; there is no fallback-to-original
    // arm here and there must never be one. See uploads.ts, which says the same
    // about the same bucket.
    console.warn("[pet-photo] re-encode failed for the public bucket, rejecting", {
      stagedPath,
      message: err instanceof Error ? err.message : String(err),
    });
    await discardStaged();
    return { ok: false, code: "photo_not_an_image" };
  }

  // Derived from what the BYTES are, not from what the ticket claimed. A caller
  // that declared `image/png` and uploaded a JPEG gets a `.jpg` key and a
  // `image/jpeg` row, because that is what is true.
  const finalPath = `${petId}/${randomUUID()}.${rasterExtension(detected)}`;

  const { error: uploadError } = await admin.storage
    .from(PET_PHOTO_BUCKET)
    .upload(finalPath, normalised, { contentType: detected });
  if (uploadError) {
    console.error("[pet-photo] could not write the normalised photo", {
      petId,
      message: uploadError.message,
    });
    await discardStaged();
    return { ok: false, code: "photo_failed" };
  }

  let replacedPrevious: boolean | null = false;
  try {
    replacedPrevious = await db.transaction(async (tx) => {
      // THE SOFT-DELETE FILTER, and it decides the write rather than decorating
      // the read: no row here means the animal was erased, and the transaction
      // returns `null` so nothing below it runs. See the `pet_gone` docblock on
      // ConfirmResult for why this is the only place the filter exists.
      const [current] = await tx
        .select({ primaryPhotoId: pets.primaryPhotoId })
        .from(pets)
        .where(and(eq(pets.id, petId), isNull(pets.deletedAt)))
        .limit(1);
      if (!current) return null;

      const [row] = await tx
        .insert(attachments)
        .values({
          petId,
          uploadedByUserId: userId,
          storagePath: finalPath,
          mimeType: detected,
          fileSize: normalised.byteLength,
        })
        .returning({ id: attachments.id });

      // The filter is repeated on the WRITE, not inherited from the read above.
      // Inside one transaction the two are consistent, so this is belt on top of
      // braces — but a `set()` whose predicate is "this id" and nothing else is
      // one refactor away from being moved out of the transaction, and then the
      // braces are gone and nobody notices.
      await tx
        .update(pets)
        .set({ primaryPhotoId: row.id })
        .where(and(eq(pets.id, petId), isNull(pets.deletedAt)));
      return current.primaryPhotoId != null;
    });
  } catch (err) {
    console.error("[pet-photo] could not record the photo", {
      petId,
      message: err instanceof Error ? err.message : String(err),
    });
    // The object is written and no row points at it. Remove it rather than
    // leave an orphan nothing will ever reference — the same cleanup every
    // Server Action does when its transaction fails after an upload.
    try {
      await admin.storage.from(PET_PHOTO_BUCKET).remove([finalPath]);
    } catch {
      // Best-effort, exactly like the staged discard.
    }
    await discardStaged();
    return { ok: false, code: "photo_failed" };
  }

  if (replacedPrevious === null) {
    // The animal is soft-deleted. Take back the object we just wrote — a photo
    // of an erased pet is precisely what art. 16 removed — and answer the way
    // every other surface answers about a pet that is gone.
    try {
      await admin.storage.from(PET_PHOTO_BUCKET).remove([finalPath]);
    } catch {
      // Best-effort, exactly like the staged discard.
    }
    await discardStaged();
    return { ok: false, code: "pet_gone" };
  }

  await discardStaged();

  const url = petPhotoUrl(finalPath);
  if (!url) {
    // petPhotoUrl only returns null for an empty path, which cannot happen
    // here. Handled rather than asserted so a misconfigured SUPABASE_URL is a
    // 500 with a log line instead of a payload carrying a broken string.
    console.error("[pet-photo] saved the photo but could not build its URL", { finalPath });
    return { ok: false, code: "photo_failed" };
  }

  return { ok: true, photo: { photoUrl: url, replacedPrevious } };
}
