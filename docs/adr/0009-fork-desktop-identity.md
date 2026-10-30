# 0009. The fork installs as "T3 Dialogue" with its own identity and T3 home

- Status: accepted
- Date: 2026-10-28

## Context

Living with voice mode means running the fork as an installed desktop app next to the official
T3 Code app, not instead of it. A plain `vp run dist:desktop:dmg` of the fork collides with the
official app on three identities, so the two cannot run at once:

- The Electron profile folder is hard-coded (`t3code-v2`), and the single-instance lock is
  keyed on it. Launching the fork would only focus the official app.
- The packaged backend uses `~/.t3/userdata`, the official app's live database. The server
  refuses a second owner of that directory, and sharing it is rule 2 in AGENTS.md anyway.
- The bundle id, product name, and `t3code://` scheme are the same.

The server derives its state dir from the T3 home and has no separate override, and the voice
engine already honors `T3CODE_VOICE_DIR`.

## Decision

- A desktop build has a brand, fixed at bundle time by `T3CODE_DESKTOP_BRAND` and read by both
  the packaging script and the app bundle from one table (`DesktopBrand.ts`). The default is the
  official brand, which builds exactly what it built before.
- The `dialogue` brand is "T3 Dialogue": bundle id `com.brandon-nash.t3code-dialogue`, profile
  folder `t3code-dialogue`, scheme `t3code-dialogue://`, artifact prefix `T3-Dialogue`, and a
  teal-tinted icon.
- Its T3 home is `~/.t3/dialogue`, so state lands in `~/.t3/dialogue/userdata` and worktrees and
  caches stay separate. The desktop passes `T3CODE_VOICE_DIR=~/.t3/voice` to its backend, so the
  models and `voice.json` already installed are shared with the official app's server and the
  dev server, and nothing is downloaded twice. `T3CODE_HOME` still overrides the home.
- A fork brand never gets an update feed, even when publish tokens are present, so an update
  can never replace it with the official app.
- Development builds are unchanged: the `t3code-dev` profile, scheme, and `~/.t3/dev` state.

## Consequences

- The fork starts with an empty database; projects are added again. Seeding from a snapshot of
  `~/.t3/userdata`, the way `vp run migrate-dev-db` does, is a follow-up if that is annoying.
- Only macOS packaging is exercised. Linux desktop entries, metainfo, and the Windows icon keep
  the official names under the fork brand.
- The fork brand installs its own `t3` CLI shim pointing at its home; the official shim is left
  alone.
- The web app inside the fork still calls itself T3 Code in its own text; only the OS-facing
  identity changes.
