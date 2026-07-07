// Unit tests for uploadAttachmentIfPresent EXIF-stripping (P0g).
//
// Tests verify:
//   1. stripMetadata:true routes through sharp and uploads a processed Buffer.
//   2. stripMetadata false/absent uploads the original File (back-compat).
//   3. Non-image file → validation error regardless of stripMetadata.
//   4. sharp throwing → non-fatal fallback to original file.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock: sharp (dynamic import inside uploads.ts)
// ---------------------------------------------------------------------------

const mockToBuffer = vi.fn();
const mockRotate = vi.fn(() => ({ toBuffer: mockToBuffer }));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSharpInstance = vi.fn((_arg: any) => ({ rotate: mockRotate }));

vi.mock("sharp", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (arg: any) => mockSharpInstance(arg),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Real magic-byte prefixes so the file passes the signature validation.
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_MAGIC = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

// Builds a File whose bytes start with a real image signature so magic-byte
// validation accepts it. `type` is intentionally decoupled from the bytes —
// validation ignores the client-supplied MIME.
function makeImageFile(magic: Uint8Array, name: string, type: string): File {
  const body = new Uint8Array([...magic, ...new TextEncoder().encode("payload")]);
  return new File([body], name, { type });
}

// A valid JPEG-signed file — the default happy-path fixture.
function makeFile(_content: string, name: string, type: string): File {
  return makeImageFile(JPEG_MAGIC, name, type);
}

function makeSupabaseClient(uploadError: string | null = null) {
  const uploadMock = vi.fn(async () => ({
    error: uploadError ? { message: uploadError } : null,
  }));
  return {
    storage: {
      from: () => ({ upload: uploadMock }),
    },
    uploadMock,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("uploadAttachmentIfPresent — stripMetadata option", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: sharp returns a processed buffer.
    mockToBuffer.mockResolvedValue(Buffer.from("processed-bytes"));
  });

  it("stripMetadata:true routes through sharp and uploads a Buffer", async () => {
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("fake-image-data", "photo.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
      {
        stripMetadata: true,
      },
    );

    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    // sharp was called with the file's buffer content.
    expect(mockSharpInstance).toHaveBeenCalledOnce();
    expect(mockRotate).toHaveBeenCalledOnce();
    expect(mockToBuffer).toHaveBeenCalledOnce();
    // The upload call should have received the PROCESSED buffer (sharp's
    // output), not the original bytes — this guards against a regression
    // where the pre-sharp buffer is uploaded by mistake.
    const [, uploadedBody] = supabase.uploadMock.mock.calls[0] as unknown as [string, unknown];
    expect(Buffer.isBuffer(uploadedBody)).toBe(true);
    expect(uploadedBody).toEqual(Buffer.from("processed-bytes"));
    // And the reported size reflects the stored (processed) buffer.
    expect(result.size).toBe(Buffer.from("processed-bytes").length);
  });

  it("stripMetadata:false uploads the original File unchanged (back-compat)", async () => {
    vi.resetModules();
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("fake-image-data", "photo.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
      {
        stripMetadata: false,
      },
    );

    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    // sharp should NOT have been called.
    expect(mockSharpInstance).not.toHaveBeenCalled();
    // The upload call should have received the original File object.
    const [, uploadedBody] = supabase.uploadMock.mock.calls[0] as unknown as [string, unknown];
    expect(uploadedBody).toBe(file);
  });

  it("no options → uploads the original File unchanged (back-compat)", async () => {
    vi.resetModules();
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("fake-image-data", "photo.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
    );

    expect(result.error).toBeNull();
    expect(mockSharpInstance).not.toHaveBeenCalled();
    const [, uploadedBody] = supabase.uploadMock.mock.calls[0] as unknown as [string, unknown];
    expect(uploadedBody).toBe(file);
  });

  it("non-image file → returns validation error regardless of stripMetadata", async () => {
    vi.resetModules();
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    // Raw bytes with no raster signature, even though type claims application/pdf.
    const file = new File(["%PDF-1.7 not an image"], "doc.pdf", { type: "application/pdf" });

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
      {
        stripMetadata: true,
      },
    );

    expect(result.error).toBeTruthy();
    expect(result.uploadedPath).toBeNull();
    expect(mockSharpInstance).not.toHaveBeenCalled();
  });

  it("sharp throws → non-fatal fallback: uploads original File", async () => {
    vi.resetModules();
    mockToBuffer.mockRejectedValue(new Error("sharp unsupported format"));
    mockRotate.mockReturnValue({ toBuffer: mockToBuffer });
    mockSharpInstance.mockReturnValue({ rotate: mockRotate });

    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("corrupt-image-data", "bad.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
      {
        stripMetadata: true,
      },
    );

    // Non-fatal: upload should still succeed with the original file.
    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    // Upload body is the original File (not a Buffer).
    const [, uploadedBody] = supabase.uploadMock.mock.calls[0] as unknown as [string, unknown];
    expect(uploadedBody).toBe(file);
  });
});

// ---------------------------------------------------------------------------
// Magic-byte validation, path-traversal, and public-bucket re-encode (id 924)
// ---------------------------------------------------------------------------

describe("uploadAttachmentIfPresent — content validation & public re-encode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockToBuffer.mockResolvedValue(Buffer.from("processed-bytes"));
    mockRotate.mockReturnValue({ toBuffer: mockToBuffer });
    mockSharpInstance.mockReturnValue({ rotate: mockRotate });
  });

  it("rejects an SVG even when labeled image/svg+xml (stored-XSS vector)", async () => {
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const svg = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
      "evil.svg",
      { type: "image/svg+xml" },
    );

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      svg,
      "pet-photos",
    );

    expect(result.error).toBeTruthy();
    expect(result.uploadedPath).toBeNull();
    expect(supabase.uploadMock).not.toHaveBeenCalled();
  });

  it("rejects fake content-type: image/jpeg header on non-JPEG bytes", async () => {
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    // Claims image/jpeg but the bytes carry no raster signature.
    const fake = new File(["totally not a jpeg, just text"], "photo.jpg", {
      type: "image/jpeg",
    });

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      fake,
      "pet-photos",
    );

    expect(result.error).toBeTruthy();
    expect(result.uploadedPath).toBeNull();
    expect(supabase.uploadMock).not.toHaveBeenCalled();
  });

  it("storage key never contains '../' or a client-supplied extension", async () => {
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    // Malicious filename that would inject traversal if the ext came from it.
    const file = makeImageFile(JPEG_MAGIC, "x.jpg/../../evil.svg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
    );

    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    expect(result.uploadedPath).not.toContain("../");
    expect(result.uploadedPath).not.toContain("/");
    // Extension is derived from the validated MIME (jpeg → jpg), not the name.
    expect(result.uploadedPath?.endsWith(".jpg")).toBe(true);
    expect(result.uploadedPath).not.toContain("svg");
    const [storageKey] = supabase.uploadMock.mock.calls[0] as unknown as [string];
    expect(storageKey).not.toContain("../");
  });

  it("pet-photos re-encodes through sharp with NO stripMetadata option", async () => {
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeImageFile(PNG_MAGIC, "pet.png", "image/png");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "pet-photos",
    );

    expect(result.error).toBeNull();
    // Public bucket forces re-encode even without stripMetadata:true.
    expect(mockSharpInstance).toHaveBeenCalledOnce();
    const [, uploadedBody] = supabase.uploadMock.mock.calls[0] as unknown as [string, unknown];
    expect(Buffer.isBuffer(uploadedBody)).toBe(true);
    expect(uploadedBody).toEqual(Buffer.from("processed-bytes"));
    // contentType is the validated MIME, and reported size is the stored buffer.
    expect(result.mimeType).toBe("image/png");
    expect(result.size).toBe(Buffer.from("processed-bytes").length);
  });

  it("pet-photos rejects (no raw passthrough) when sharp fails on a public bucket", async () => {
    mockToBuffer.mockRejectedValue(new Error("sharp decode failed"));
    mockRotate.mockReturnValue({ toBuffer: mockToBuffer });
    mockSharpInstance.mockReturnValue({ rotate: mockRotate });

    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeImageFile(JPEG_MAGIC, "pet.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "pet-photos",
    );

    // Must NOT upload attacker-controlled bytes to the public bucket.
    expect(result.error).toBeTruthy();
    expect(result.uploadedPath).toBeNull();
    expect(supabase.uploadMock).not.toHaveBeenCalled();
  });

  it("accepts a valid WEBP file", async () => {
    const { uploadAttachmentIfPresent } = await import("@/lib/infra/uploads");
    const supabase = makeSupabaseClient();
    const file = makeImageFile(WEBP_MAGIC, "pet.webp", "image/webp");

    const result = await uploadAttachmentIfPresent(
      supabase as Parameters<typeof uploadAttachmentIfPresent>[0],
      file,
      "event-attachments",
    );

    expect(result.error).toBeNull();
    expect(result.uploadedPath?.endsWith(".webp")).toBe(true);
    expect(result.mimeType).toBe("image/webp");
  });
});
