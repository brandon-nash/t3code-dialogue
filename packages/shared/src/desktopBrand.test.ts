import { describe, expect, it } from "vite-plus/test";

import { DESKTOP_BRANDS, resolveDesktopBrand } from "./desktopBrand.ts";

describe("resolveDesktopBrand", () => {
  it("defaults to the official brand", () => {
    expect(resolveDesktopBrand(undefined)).toBe(DESKTOP_BRANDS.t3code);
    expect(resolveDesktopBrand("  ")).toBe(DESKTOP_BRANDS.t3code);
    expect(resolveDesktopBrand("dialogue")).toBe(DESKTOP_BRANDS.dialogue);
  });

  it("refuses a brand it does not know", () => {
    expect(() => resolveDesktopBrand("nightly")).toThrow(/Unknown desktop brand "nightly"/);
  });

  it("gives the fork its own identity on every field the OS or server keys on", () => {
    const official = DESKTOP_BRANDS.t3code;
    const fork = DESKTOP_BRANDS.dialogue;
    for (const key of ["appId", "profileName", "scheme", "artifactPrefix", "baseName"] as const) {
      expect(fork[key]).not.toBe(official[key]);
    }
    expect(fork.homeSegments).not.toEqual(official.homeSegments);
    expect(fork.sharedVoiceSegments).toEqual([".t3", "voice"]);
  });
});
