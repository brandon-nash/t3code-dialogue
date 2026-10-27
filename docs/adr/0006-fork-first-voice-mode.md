# 0006. Voice mode is fork-first, not an upstream PR

- Status: accepted
- Date: 2026-10-27

## Context

This fork exists to add a local, two-way voice mode for one person's daily use. Upstream T3 Code
requires explicit maintainer approval before feature PRs and already has overlapping open work,
none of it reviewed by maintainers as of this date:

- PR 19273: local dictation on web and desktop with sherpa-onnx and Parakeet v3, PCM streamed
  during recording, model download in Settings.
- PR 14882: configurable local transcription with a dictionary, filler removal, and LLM cleanup.
- PR 14865: Codex realtime voice conversations (cloud based).
- Discussion 17317 (voice orders) and 7417 (push-to-talk, most upvoted voice idea).

Our distinct contribution is talk-back: local TTS, speakable-text reduction, and the `<speak>`
convention. Dictation itself is well covered upstream.

## Decision

Build and merge voice mode in this fork. Do not open upstream PRs for it. Borrow from upstream
where it is ahead (streaming transcription during recording, model lifecycle, Settings UI) and
keep fork-only code isolated so upstream merges stay cheap.

## Consequences

- Fork-specific code lives in `apps/server/src/voice`, `apps/web/src/voice`, `scripts/voice`,
  and `docs/adr`. Touch points in shared files (composer, server layer list, keybindings,
  externals) stay small and are the only expected merge conflicts.
- Upstream `main` is merged regularly from the `upstream` remote.
- Multi-surface and remote support follow this fork's needs, not the upstream PR bar.
- If upstream lands dictation, this fork should adopt it and keep only the talk-back layer. If
  that layer proves valuable, an upstream Ideas discussion for talk-back is the right first step,
  not a PR.
- Work is tracked in this fork's GitHub issues, one milestone per phase.
