import { describe, expect, it } from "vitest";
import { petStatusToPhotoStatus } from "./poncho-status";

describe("petStatusToPhotoStatus", () => {
  it("active → ok", () => {
    expect(petStatusToPhotoStatus("active")).toBe("ok");
  });

  it("lost → lost", () => {
    expect(petStatusToPhotoStatus("lost")).toBe("lost");
  });

  it("deceased → deceased", () => {
    expect(petStatusToPhotoStatus("deceased")).toBe("deceased");
  });
});
