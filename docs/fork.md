# T3 Dialogue: this fork

T3 Dialogue is a personal fork of [T3 Code](https://github.com/pingdotgg/t3code) that adds a
fully local voice mode and a few workflow features. It tracks upstream `main` and installs
beside the official desktop app, so you can run both.

## What is different

- **Voice.** Dictate into the composer and hear replies read aloud. Speech-to-text and
  text-to-speech run on the machine that hosts your T3 server, using local models; nothing is
  sent to a speech service.
  [Dictation and spoken replies](./user/composer.md#dictation-and-spoken-replies-on-web-and-desktop)
  · [one-time model install](../scripts/voice/README.md)
- **Open an existing Claude Code session.** Bring a session you started in a terminal into T3
  Code as a thread and keep going there.
  [Open an existing Claude Code session](./user/thread-sidebar.md#open-an-existing-claude-code-session)
- **A side-by-side desktop app.** The fork builds as "T3 Dialogue" with its own bundle id, URL
  scheme, and T3 home, so it never touches the official app's data.
  [ADR 0009](./adr/0009-fork-desktop-identity.md)

The reasoning behind these is recorded as
[architecture decision records](./adr/README.md).

## Install the desktop app

There are no published releases. Build the DMG (below), open it, and drag **T3 Dialogue** to
Applications. It coexists with T3 Code: a separate icon, separate settings, and its own data in
`~/.t3/dialogue`. The voice models in `~/.t3/voice` are shared, so both apps can use them.

The first launch runs the same setup as a fresh T3 Code install. Point it at the same projects
if you like; the two apps keep separate thread histories.

### Update

Local builds have no update feed, so the in-app update button cannot update T3 Dialogue itself.
It still updates servers and providers. To move to a newer build, quit T3 Dialogue, build a new
DMG, and drag it over the old copy in Applications. Threads and settings stay in
`~/.t3/dialogue`.

## Build the desktop app

From a checkout of this fork on macOS, with the
[macOS DMG prerequisites](./operations/development.md#macos-dmg-prerequisites) installed:

```sh
vp i
T3CODE_DESKTOP_BRAND=dialogue vp run dist:desktop:dmg
```

The DMG lands in `release/` at the repository root as `T3-Dialogue-<version>-<arch>.dmg`.
Without the brand variable the build is a plain T3 Code that would replace the official app.
[Fork brand](./operations/development.md#fork-brand) lists what the brand changes.

### Things that bite

- **`vp` is not on your `PATH`.** The repo pins Node 26.12.1 in `package.json`. Put that Node
  on `PATH` (for example `nvm use 26`) and run the repo-local `node_modules/.bin/vp` after a
  first `pnpm install`.
- **A global npm registry override.** If `~/.npmrc` points `registry=` at a private registry
  such as CodeArtifact, `vp i` and the unused-patches step of `vp run check:changed` fail trying
  to reach it. Point pnpm at an empty user config for those commands:
  `touch /tmp/empty.npmrc` once, then prefix with `npm_config_userconfig=/tmp/empty.npmrc`.
- **Building from inside T3 Code.** Terminals and agents launched from the desktop app inherit
  `ELECTRON_RUN_AS_NODE=1`, which makes Electron-based build steps run as plain Node and fail.
  Prefix the build with `env -u ELECTRON_RUN_AS_NODE`.
- **CI never runs on the fork.** Upstream's workflow targets Blacksmith runners, which this fork
  does not have, so every PR's checks sit queued and are cancelled after a day. Red checks on
  fork PRs mean nothing. `vp run check:changed` run locally before pushing is the gate.
