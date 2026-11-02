import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { resolveDesktopBaseDir } from "./DesktopStatePaths.ts";

const joinPath = (...segments: string[]) => segments.join("/");

describe("resolveDesktopBaseDir", () => {
  it("places the fork's home below the shared .t3 directory", () => {
    expect(
      resolveDesktopBaseDir({
        homeDirectory: "/home/user",
        joinPath,
        t3Home: Option.none(),
        homeSegments: [".t3", "extended"],
      }),
    ).toBe("/home/user/.t3/extended");
  });

  it("lets T3CODE_HOME override any brand", () => {
    expect(
      resolveDesktopBaseDir({
        homeDirectory: "/home/user",
        joinPath,
        t3Home: Option.some("/srv/t3"),
        homeSegments: [".t3", "extended"],
      }),
    ).toBe("/srv/t3");
  });
});
