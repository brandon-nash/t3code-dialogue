# 0010. The fork brand is "T3 Extended"

- Status: accepted
- Date: 2026-11-02
- Supersedes: [0009](./0009-fork-desktop-identity.md) (the name only; the identity model stands)

## Context

ADR 0009 named the fork build "T3 Dialogue" when voice mode was its only addition. The fork now
also opens existing Claude Code sessions as threads (#29) and will keep collecting features that
have nothing to do with dialogue. A name that describes one feature misleads about the rest, and
every OS-facing identity (bundle id, profile folder, scheme, T3 home) carries it.

## Decision

- The fork brand is `extended`, selected with `T3CODE_DESKTOP_BRAND=extended`, and the product is
  "T3 Extended": bundle id `com.brandon-nash.t3code-extended`, profile folder `t3code-extended`,
  scheme `t3code-extended://`, artifact prefix `T3-Extended`, T3 home `~/.t3/extended`. The icon
  and everything else in 0009 carry over unchanged, including the shared `~/.t3/voice`.
- The `dialogue` brand is removed rather than kept as an alias. One fork brand is enough, and a
  second installed copy would only invite confusion about which one holds the data.
- The repository stays `t3code-dialogue`. Renaming it breaks clones and links for no user-facing
  gain; it can follow later.

## Consequences

- Existing T3 Dialogue installs do not migrate on their own. The one-time move is
  `mv ~/.t3/dialogue ~/.t3/extended` with the old app quit, documented in the fork guide. Window
  state in the old Electron profile folder is lost, which is fine.
- Anything that linked the `t3code-dialogue://` scheme stops resolving once the old app is
  removed. Nothing in this fork registers such links.
