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

function makeFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
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
    const { uploadAttachmentIfPresent } = await import("@/lib/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("fake-image-data", "photo.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(supabase as Parameters<typeof uploadAttachmentIfPresent>[0], file, "event-attachments", {
      stripMetadata: true,
    });

    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    // sharp was called with the file's buffer content.
    expect(mockSharpInstance).toHaveBeenCalledOnce();
    expect(mockRotate).toHaveBeenCalledOnce();
    expect(mockToBuffer).toHaveBeenCalledOnce();
    // The upload call should have received the PROCESSED buffer (sharp's
    // output), not the original bytes — this guards against a regression
    // where the pre-sharp buffer is uploaded by mistake.
    const [, uploadedBody] = (supabase.uploadMock.mock.calls[0] as unknown) as [string, unknown];
    expect(Buffer.isBuffer(uploadedBody)).toBe(true);
    expect(uploadedBody).toEqual(Buffer.from("processed-bytes"));
    // And the reported size reflects the stored (processed) buffer.
    expect(result.size).toBe(Buffer.from("processed-bytes").length);
  });

  it("stripMetadata:false uploads the original File unchanged (back-compat)", async () => {
    vi.resetModules();
    const { uploadAttachmentIfPresent } = await import("@/lib/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("fake-image-data", "photo.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(supabase as Parameters<typeof uploadAttachmentIfPresent>[0], file, "event-attachments", {
      stripMetadata: false,
    });

    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    // sharp should NOT have been called.
    expect(mockSharpInstance).not.toHaveBeenCalled();
    // The upload call should have received the original File object.
    const [, uploadedBody] = (supabase.uploadMock.mock.calls[0] as unknown) as [string, unknown];
    expect(uploadedBody).toBe(file);
  });

  it("no options → uploads the original File unchanged (back-compat)", async () => {
    vi.resetModules();
    const { uploadAttachmentIfPresent } = await import("@/lib/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("fake-image-data", "photo.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(supabase as Parameters<typeof uploadAttachmentIfPresent>[0], file, "event-attachments");

    expect(result.error).toBeNull();
    expect(mockSharpInstance).not.toHaveBeenCalled();
    const [, uploadedBody] = (supabase.uploadMock.mock.calls[0] as unknown) as [string, unknown];
    expect(uploadedBody).toBe(file);
  });

  it("non-image file → returns validation error regardless of stripMetadata", async () => {
    vi.resetModules();
    const { uploadAttachmentIfPresent } = await import("@/lib/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("pdf content", "doc.pdf", "application/pdf");

    const result = await uploadAttachmentIfPresent(supabase as Parameters<typeof uploadAttachmentIfPresent>[0], file, "event-attachments", {
      stripMetadata: true,
    });

    expect(result.error).toBeTruthy();
    expect(result.uploadedPath).toBeNull();
    expect(mockSharpInstance).not.toHaveBeenCalled();
  });

  it("sharp throws → non-fatal fallback: uploads original File", async () => {
    vi.resetModules();
    mockToBuffer.mockRejectedValue(new Error("sharp unsupported format"));
    mockRotate.mockReturnValue({ toBuffer: mockToBuffer });
    mockSharpInstance.mockReturnValue({ rotate: mockRotate });

    const { uploadAttachmentIfPresent } = await import("@/lib/uploads");
    const supabase = makeSupabaseClient();
    const file = makeFile("corrupt-image-data", "bad.jpg", "image/jpeg");

    const result = await uploadAttachmentIfPresent(supabase as Parameters<typeof uploadAttachmentIfPresent>[0], file, "event-attachments", {
      stripMetadata: true,
    });

    // Non-fatal: upload should still succeed with the original file.
    expect(result.error).toBeNull();
    expect(result.uploadedPath).toBeTruthy();
    // Upload body is the original File (not a Buffer).
    const [, uploadedBody] = (supabase.uploadMock.mock.calls[0] as unknown) as [string, unknown];
    expect(uploadedBody).toBe(file);
  });
});
