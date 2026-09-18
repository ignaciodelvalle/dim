// A real JPEG carrying a GPS position is stored WITHOUT it — through real sharp.
//
// welfare-uploads.test.ts and uploads-strip-metadata.test.ts mock sharp, so
// they prove the helpers route bytes through the strip and refuse when it
// throws; they cannot prove the strip actually drops a GPS block. This file
// builds a JPEG with an EXIF GPS IFD (the one a phone writes) and checks the
// bytes that reach storage.
//
// The fixture's own EXIF is asserted first. Without that, "the stored file has
// no EXIF" would also pass on a fixture that never had any.

import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn(
  async (_path: string, _body: unknown, _opts: unknown) =>
    ({ error: null }) as { error: { message: string } | null },
);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: uploadMock, remove: vi.fn(async () => ({ error: null })) }) },
  }),
}));

import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { uploadWelfareEvidence } from "@/lib/infra/welfare-uploads";

// Buenos Aires, as a phone would write it: degrees/minutes/seconds rationals.
const GPS = {
  GPSLatitudeRef: "S",
  GPSLatitude: "34/1 36/1 0/1",
  GPSLongitudeRef: "W",
  GPSLongitude: "58/1 22/1 0/1",
};
// Tag 0x8825 is the IFD0 pointer to the GPS IFD. sharp writes little-endian.
const GPS_IFD_POINTER_LE = Buffer.from([0x25, 0x88]);

let jpegWithGps: Buffer;

beforeAll(async () => {
  jpegWithGps = await sharp({
    create: { width: 16, height: 12, channels: 3, background: "#3a7d44" },
  })
    .jpeg()
    .withExif({ IFD0: { Make: "Apple", Model: "iPhone" }, IFD3: GPS })
    .toBuffer();
});

async function storedBody(): Promise<Buffer> {
  expect(uploadMock).toHaveBeenCalledOnce();
  const body = uploadMock.mock.calls[0][1];
  expect(Buffer.isBuffer(body)).toBe(true);
  return body as Buffer;
}

describe("the fixture really carries a GPS block", () => {
  it("has EXIF with a GPS IFD pointer", async () => {
    const meta = await sharp(jpegWithGps).metadata();
    expect(meta.exif).toBeInstanceOf(Buffer);
    expect(meta.exif?.includes(GPS_IFD_POINTER_LE)).toBe(true);
  });
});

describe("stored bytes carry no EXIF (and so no GPS)", () => {
  it("uploadWelfareEvidence — a denuncia photo", async () => {
    uploadMock.mockClear();
    const file = new File([new Uint8Array(jpegWithGps)], "denuncia.jpg", { type: "image/jpeg" });

    const result = await uploadWelfareEvidence("report-gps", [file]);

    expect(result.error).toBeNull();
    const meta = await sharp(await storedBody()).metadata();
    expect(meta.exif).toBeUndefined();
    // Still the same picture, not an empty or corrupt body.
    expect(meta).toMatchObject({ format: "jpeg", width: 16, height: 12 });
  });

  it("uploadAttachmentIfPresent with stripMetadata — a sighting or finder photo", async () => {
    uploadMock.mockClear();
    const file = new File([new Uint8Array(jpegWithGps)], "avistaje.jpg", { type: "image/jpeg" });
    const client = { storage: { from: () => ({ upload: uploadMock }) } };

    const result = await uploadAttachmentIfPresent(client, file, "event-attachments", {
      stripMetadata: true,
    });

    expect(result.error).toBeNull();
    const meta = await sharp(await storedBody()).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta).toMatchObject({ format: "jpeg", width: 16, height: 12 });
  });

  it("uploadAttachmentIfPresent with NO option — the ordinary event/medical/Atender path (D4)", async () => {
    // The ~20 call sites that never opted in stored this GPS block until
    // 2026-09-18. The strip is the default now.
    uploadMock.mockClear();
    const file = new File([new Uint8Array(jpegWithGps)], "vacuna.jpg", { type: "image/jpeg" });
    const client = { storage: { from: () => ({ upload: uploadMock }) } };

    const result = await uploadAttachmentIfPresent(client, file, "event-attachments");

    expect(result.error).toBeNull();
    const meta = await sharp(await storedBody()).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta).toMatchObject({ format: "jpeg", width: 16, height: 12 });
  });
});
