// Unit tests for uploadWelfareEvidence validation and upload logic.
// Supabase storage is mocked so no real bucket is required.
//
// The helper takes NO client argument since RA-8 R2 / migration 0164: the
// `welfare-evidence` bucket has no anon/authenticated policy, so both upload
// and cleanup run through the service-role client that the helper resolves
// itself. These tests therefore mock `@/lib/supabase/admin` rather than
// handing in a fake client.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { removeWelfareEvidence, uploadWelfareEvidence } from "@/lib/infra/welfare-uploads";

// ---------------------------------------------------------------------------
// Mock: sharp (dynamic import inside welfare-uploads.ts)
// ---------------------------------------------------------------------------

const mockToBuffer = vi.fn();
const mockRotate = vi.fn(() => ({ toBuffer: mockToBuffer }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSharpFn = vi.fn((_arg: any) => ({ rotate: mockRotate }));

vi.mock("sharp", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (arg: any) => mockSharpFn(arg),
}));

// ---------------------------------------------------------------------------
// Mock: the service-role storage client
// ---------------------------------------------------------------------------

const uploadMock = vi.fn(async () => ({ error: null }) as { error: { message: string } | null });
const removeMock = vi.fn(async () => ({ error: null }));
// When set, createAdminClient() throws — the "service-role key is missing"
// deployment state.
let adminClientError: Error | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (adminClientError) throw adminClientError;
    return { storage: { from: () => ({ upload: uploadMock, remove: removeMock }) } };
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const bytes = new Uint8Array(sizeBytes);
  return new File([bytes], name, { type });
}

/** The (path, body, options) tuple of the nth storage.upload call. */
function uploadCall(n = 0): [string, unknown, unknown] {
  return uploadMock.mock.calls[n] as unknown as [string, unknown, unknown];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadWelfareEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminClientError = null;
    uploadMock.mockImplementation(async () => ({ error: null }));
    // Default: sharp returns a distinguishable processed buffer.
    mockToBuffer.mockResolvedValue(Buffer.from("sharp-processed"));
  });

  it("returns empty result when files array is empty", async () => {
    const result = await uploadWelfareEvidence("report-id-1", []);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(0);
    expect(result.uploadedPaths).toHaveLength(0);
  });

  it("returns an error when more than 5 files are supplied", async () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`photo${i}.jpg`, "image/jpeg"));
    const result = await uploadWelfareEvidence("report-id-2", files);
    expect(result.error).toMatch(/5/);
    expect(result.uploaded).toHaveLength(0);
  });

  it("returns an error for disallowed MIME type", async () => {
    const result = await uploadWelfareEvidence("report-id-3", [
      makeFile("doc.pdf", "application/pdf"),
    ]);
    expect(result.error).toBeTruthy();
    expect(result.uploaded).toHaveLength(0);
  });

  it("returns an error when a file exceeds 25 MB", async () => {
    const tooBig = makeFile("big.jpg", "image/jpeg", 26 * 1024 * 1024);
    const result = await uploadWelfareEvidence("report-id-4", [tooBig]);
    expect(result.error).toMatch(/25 MB/);
    expect(result.uploaded).toHaveLength(0);
  });

  it("uploads a valid image and returns its storage path", async () => {
    const file = makeFile("evidence.jpg", "image/jpeg", 2048);
    const result = await uploadWelfareEvidence("report-id-5", [file]);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploadedPaths).toHaveLength(1);
    const u = result.uploaded[0];
    expect(u.storagePath).toMatch(/^report-id-5\//);
    expect(u.storagePath).toMatch(/\.jpg$/);
    expect(u.mimeType).toBe("image/jpeg");
    // fileSize reflects the processed (EXIF-stripped) buffer, not the original.
    expect(u.fileSize).toBe(Buffer.from("sharp-processed").length);
    expect(u.originalFilename).toBe("evidence.jpg");
  });

  it("uploads multiple valid files and returns all paths", async () => {
    const files = [
      makeFile("a.jpg", "image/jpeg"),
      makeFile("b.png", "image/png"),
      makeFile("c.mp4", "video/mp4"),
    ];
    const result = await uploadWelfareEvidence("report-id-6", files);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(3);
    expect(result.uploadedPaths).toHaveLength(3);
  });

  it("rolls back already-uploaded files and returns an error when Supabase upload fails", async () => {
    let callCount = 0;
    uploadMock.mockImplementation(async () => {
      callCount++;
      if (callCount > 1) return { error: { message: "storage quota exceeded" } };
      return { error: null };
    });
    const result = await uploadWelfareEvidence("report-id-7", [
      makeFile("ok.jpg", "image/jpeg"),
      makeFile("fail.jpg", "image/jpeg"),
    ]);
    expect(result.error).toMatch(/storage quota exceeded/);
    expect(result.uploaded).toHaveLength(0);
    expect(removeMock).toHaveBeenCalledOnce();
  });

  it("filters out zero-byte File entries silently", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    const real = makeFile("real.jpg", "image/jpeg");
    const result = await uploadWelfareEvidence("report-id-8", [empty, real]);
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0].originalFilename).toBe("real.jpg");
  });

  // -------------------------------------------------------------------------
  // Service-role storage identity (RA-8 R2)
  // -------------------------------------------------------------------------

  it("uploads through the SERVICE-ROLE client, never a caller-supplied one", async () => {
    await uploadWelfareEvidence("report-id-svc", [makeFile("e.jpg", "image/jpeg")]);
    // The only storage handle in play is the mocked admin client's. If the
    // helper ever accepts a caller client again, this mock stops being the one
    // that receives the write and the assertion fails.
    expect(uploadMock).toHaveBeenCalledOnce();
    expect(uploadCall()[0]).toMatch(/^report-id-svc\//);
  });

  it("fails closed with a user-facing error when the service-role client is unavailable", async () => {
    adminClientError = new Error("Supabase admin client not configured: missing env vars.");
    const result = await uploadWelfareEvidence("report-id-nokey", [
      makeFile("e.jpg", "image/jpeg"),
    ]);
    // Not a silent success: a denuncia must never be recorded as "submitted
    // with evidence" when the evidence went nowhere.
    expect(result.error).toBeTruthy();
    expect(result.uploaded).toHaveLength(0);
    expect(result.uploadedPaths).toHaveLength(0);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EXIF-stripping behaviour
  // -------------------------------------------------------------------------

  it("raster image (jpeg/png/webp) routes through sharp and uploads the processed buffer", async () => {
    const file = makeFile("photo.jpg", "image/jpeg", 4096);
    const result = await uploadWelfareEvidence("report-id-exif-1", [file]);

    expect(result.error).toBeNull();
    // sharp was invoked.
    expect(mockSharpFn).toHaveBeenCalledOnce();
    expect(mockRotate).toHaveBeenCalledOnce();
    expect(mockToBuffer).toHaveBeenCalledOnce();
    // The body passed to storage.upload is the processed Buffer, not the original File.
    const uploadedBody = uploadCall()[1];
    expect(Buffer.isBuffer(uploadedBody)).toBe(true);
    expect(uploadedBody).toEqual(Buffer.from("sharp-processed"));
    // fileSize reflects the processed buffer length.
    expect(result.uploaded[0].fileSize).toBe(Buffer.from("sharp-processed").length);
  });

  it("non-image evidence (video/mp4) bypasses sharp and is uploaded as-is", async () => {
    const file = makeFile("clip.mp4", "video/mp4", 1024);
    const result = await uploadWelfareEvidence("report-id-exif-2", [file]);

    expect(result.error).toBeNull();
    // sharp must NOT have been called for non-raster types.
    expect(mockSharpFn).not.toHaveBeenCalled();
    // Uploaded body is the original File.
    expect(uploadCall()[1]).toBe(file);
    // fileSize is the original file size.
    expect(result.uploaded[0].fileSize).toBe(1024);
  });

  it("sharp throw is non-fatal: falls back to uploading the original file", async () => {
    mockToBuffer.mockRejectedValue(new Error("sharp: unsupported format"));

    const file = makeFile("corrupt.jpg", "image/jpeg", 512);
    const result = await uploadWelfareEvidence("report-id-exif-3", [file]);

    // Overall upload succeeds despite the sharp failure.
    expect(result.error).toBeNull();
    expect(result.uploaded).toHaveLength(1);
    // Upload body fell back to the original File.
    expect(uploadCall()[1]).toBe(file);
    // fileSize is the original size since the processed buffer was never produced.
    expect(result.uploaded[0].fileSize).toBe(512);
  });
});

describe("removeWelfareEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminClientError = null;
  });

  it("removes through the service-role client (the bucket has no DELETE policy)", async () => {
    await removeWelfareEvidence(["r/1.jpg", "r/2.jpg"]);
    expect(removeMock).toHaveBeenCalledWith(["r/1.jpg", "r/2.jpg"]);
  });

  it("is a no-op for an empty path list", async () => {
    await removeWelfareEvidence([]);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("never throws when the service-role client is unavailable", async () => {
    adminClientError = new Error("Supabase admin client not configured: missing env vars.");
    await expect(removeWelfareEvidence(["r/1.jpg"])).resolves.toBeUndefined();
  });
});
