/**
 * A desktop build's identity. The fork brand lets a self-built app install and run beside the
 * official one: every field that macOS, Chromium, or the server keys on is distinct.
 */
export interface DesktopBrand {
  readonly id: "t3code" | "dialogue";
  readonly baseName: string;
  /** Bundle id on macOS and app user model id on Windows. */
  readonly appId: string;
  /** Electron user data folder for packaged builds; the single-instance lock is keyed on it. */
  readonly profileName: string;
  /** T3 home below the home directory. The server derives its state dir from it. */
  readonly homeSegments: ReadonlyArray<string>;
  /** Voice models and settings to share with other T3 homes on the machine, if any. */
  readonly sharedVoiceSegments: ReadonlyArray<string> | null;
  /** URL scheme for the packaged app; development builds use `t3code-dev`. */
  readonly scheme: string;
  readonly artifactPrefix: string;
}

export const DESKTOP_BRANDS: Record<DesktopBrand["id"], DesktopBrand> = {
  t3code: {
    id: "t3code",
    baseName: "T3 Code",
    appId: "com.t3tools.t3code",
    profileName: "t3code-v2",
    homeSegments: [".t3"],
    sharedVoiceSegments: null,
    scheme: "t3code",
    artifactPrefix: "T3-Code",
  },
  dialogue: {
    id: "dialogue",
    baseName: "T3 Dialogue",
    appId: "com.brandon-nash.t3code-dialogue",
    profileName: "t3code-dialogue",
    homeSegments: [".t3", "dialogue"],
    sharedVoiceSegments: [".t3", "voice"],
    scheme: "t3code-dialogue",
    artifactPrefix: "T3-Dialogue",
  },
};

export function resolveDesktopBrand(id: string | undefined): DesktopBrand {
  const trimmed = id?.trim() ?? "";
  if (trimmed === "") return DESKTOP_BRANDS.t3code;
  if (trimmed === "t3code" || trimmed === "dialogue") return DESKTOP_BRANDS[trimmed];
  throw new Error(
    `Unknown desktop brand "${trimmed}". T3CODE_DESKTOP_BRAND accepts "t3code" or "dialogue".`,
  );
}
