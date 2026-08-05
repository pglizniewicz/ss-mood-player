# DESIGN

Design intent for ss-mood-player. `app/src/tokens.css` is the CSS projection of what is written
here; when the two disagree, the disagreement is a question for a human, not something to silently
reconcile.

## Character

An instrument panel, not a media player. The listener is inspecting the structure of a 1994 game
score, so the interface favours legibility and dense information over decoration: no gradients, no
shadows, no animation beyond what communicates state.

## Palette

Neutral blue-grey surfaces in OkLCh (`oklab` is Baseline Widely Available since 2025-11-09), with a
single green accent for actions and a red reserved exclusively for failures. Light and dark are both
first-class via `prefers-color-scheme` — the panel is as likely to be read on a phone at night as on
a desktop. Contrast targets WCAG AA (4.5:1) for body text.

## Typography

System UI stack; no web fonts — a font download is not worth the bytes on a phone that is about to
fetch a soundfont. Fluid sizes via `clamp()`. Monospace (`--font-mono`) is reserved for the debug
event log and for tick/bar numbers, where alignment carries meaning.

## Spacing and layout

A four-step spacing scale (xs/sm/md/lg). Page-level layout is CSS Grid with named areas; component
layout is flexbox with `gap`. Responsiveness comes from container queries on `body`, not media
queries, so panels reflow based on the space they actually have.

## Component rules

- Panels are bordered, slightly raised sections with a heading — each maps to one axis of variant
  control (sequences, branch points, channel layers).
- Only one accent-coloured button per panel: the action that starts sound.
- State is always stated in words (`role="status"`), never by colour alone.
