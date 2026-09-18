// Upload size ceilings, as plain constants.
//
// Kept apart from ./validate.ts on purpose: that module imports sharp, and a
// client component that reaches it drags node:crypto/node:events into the
// browser bundle, which fails the build. Anything a form needs to show or
// pre-check lives here; ./validate.ts re-exports it for the server side.

/**
 * The size ceiling for a raster image, in bytes.
 *
 * Two enforcement points must agree on it: the Server Action path checks
 * `file.size` before reading, and the buckets declare the same number as their
 * `file_size_limit`, so the Storage API refuses an oversized PUT that no server
 * code ever sees. A limit the client volunteers is not a limit; a limit the
 * object store enforces is.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
