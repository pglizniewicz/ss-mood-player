# ss-mood-player

An **XMI** file player (XMIDI, the Miles/AIL format) with variant switching during playback —
inspired by the dynamic music engine of System Shock 1 in the
[Shockolate](https://github.com/Interrupt/systemshock) port.

XMI is not MIDI: a note-on event carries **duration** instead of a separate note-off, time is
encoded as "interval bytes", the clock is fixed (PPQN 60 + tempo 500,000 µs/qn = 120 ticks/s),
and transitions between moods rely on the `RBRN` chunk and XMIDI controller 120 (*sequence
branch index*). The parser is therefore part of this project, not a dependency.

## Running it

```bash
npm run serve       # http://127.0.0.1:3000
```

The application in `app/src` **has no build step and no runtime dependencies installed by
npm** — its libraries are vendored as self-contained ESM modules in `app/src/libs/` and mapped
through an import map in `index.html`. `npm install` at the repo root is only for development
tooling (Playwright, TypeScript for JSDoc type-checking).

## Tests

```bash
npm test            # node --test: parser, timeline, transport, golden RMS, BCE architecture
npm run typecheck   # tsc --checkJs over JSDoc, no transpilation
npm run test:e2e    # Playwright + Chromium: worklet, bank, transport in the browser
```

## Offline render (a debugging tool)

```bash
npm run render -- data/THM1.XMI /tmp/out.wav --sequence 9
npm run render -- data/THM1.XMI /tmp/out.wav --sequence 9 --then 17   # switch at the loop boundary
```

Prints an RMS table in 100 ms windows and the transport log, so you can hear *and see* what
happened — no browser, no sound card. Renders ~30× faster than real time and uses exactly the
same code (`timeline.js`, `transport.js`, `dispatch.js`, `render.js`) as the worklet, so its
output is evidence about the real playback path. Without `--soundfont` it takes the bank from
the repo; `--soundfont ""` is not supported, but when the file does not exist you can point it
at your own.

## SoundFont

The repo ships **GeneralUser GS 2.0.3** in SF3 format (`app/src/assets/GeneralUserGS.sf3`,
8,423,728 bytes, sha256 `e2ed326f…`), by **S. Christian Collins**. The *GeneralUser GS License
v2.0* is permissive, allows commercial use and modification, and the author **explicitly asks**
that you not link to their files but host your own copy — which is exactly what we do. The full
license text sits next to the bank in `GeneralUserGS-LICENSE.txt`.

This copy comes from the SpessaSynth repository (an SF2 → SF3 conversion of the same bank), which
is why its internal `INAM` field says "GeneralUser GS 2.0.3 BETA". The bank is the default, not
the only one — the UI lets you upload your own SF2/SF3/DLS.

## Architecture

Boundary–Control–Entity, one business component `player` (`app/src/player/`). The dependency
direction — boundary → control → entity — is **enforced by a test**
(`tests/unit/architecture.test.js`): `control/` and `entity/` may not reach into `boundary/` or
Web Audio. That is what lets the parser, scheduler, and variant state machine run under
`node --test`, without a browser.

Web Audio is touched only by `player/boundary/AudioOut.js`. The synthesizer (`spessasynth_core`)
is driven note by note from our own timeline — it is never handed a file, because no MIDI
sequencer models either XMI durations or branch-point jumps.

## Data

XMI files are **not** in this repository (the data is copyrighted to System Shock). Drop your
own into `data/` — that directory is in `.gitignore`. The automated tests use generated fixtures.

## The player requires the whole theme, not just the XMI

**The XMI file alone is not enough for faithful playback.** It is a bank of four-bar modules in
several keys; the order they are meant to play in lives in the files next to it:

| file | role | required |
|---|---|---|
| `THMn.XMI` | music modules (50 sequences in our data) | yes |
| `THMn.BIN` | score tables — 405 B | **yes** |
| `THMn.DAT` | module descriptions: bar counts, channel masks — 786 B | optional |

Select all of them at once in the "Theme files" field. Without `BIN` the player **refuses to
play** and says why, instead of playing something that does not sound like the game.

I read the `BIN` format from `MacTune.c` in Shockolate, which loads the same bytes into
`track_table[8][4]`, `transition_table[9]`, `layering_table[32][10]`, and `key_table[22][2]` —
which, together with the constants from `mlimbs.h`, add up to exactly 405 bytes. Superchunk `k`
plays XMI sequence `k+1` (in `musicai.c`: `track = 1 + piece_ID`), and `key_table` gives the key
of every module, matching the key worked out from the notes themselves — that is what
`tests/unit/score.test.js` asserts.

What we established about `THM1.XMI` (CRC32 `e5732a74`, byte-for-byte the retail
`SOUND/GENMIDI/` file): 50 four-bar modules across seven key groups, **General MIDI** program
numbering (the game ships one set of `THM*.XMI` plus `INI-MT.XMI` and `INI-SC.XMI` — only the
device initialization differs), channel 9 is GM percussion.

Render a score from the command line:

```bash
npm run render -- data/THM1.XMI /tmp/score6.wav --score 6 --seconds 46
```

Export to standard MIDI, for checking the notes in another tool:

```bash
node tools/export-midi.js data/THM1.XMI /tmp/seq9.mid --sequence 9
```

## Conventions

The project uses the vendored [airails](https://github.com/AdamBien/airails) skills from
`.claude/skills/` (`web-components`, `web-conventions`, `javascript-conventions`, `bce`) plus a
`DESIGN.md`. Deliberate deviations:

- **Relative URLs instead of root-absolute.** The `web-components` skill requires `/style.css`
  and the like to support an `index.html` routing fallback. This app is a single screen with no
  router, so no fallback exists, and relative paths are what let it run on GitHub Pages under
  the `/ss-mood-player/` subdirectory.
- **The worklet's import is relative.** Import maps do not apply inside
  `AudioWorkletGlobalScope`, so `worklet/SynthProcessor.js` addresses `../libs/spessasynth_core.js`
  by path.
- **`node --test` alongside Playwright.** The skill only calls for e2e tests; the binary parser
  needs unit tests, and Node's built-in runner adds no dependency to get them.
- **No `tokens.json`.** `web-conventions` forbids the DTCG format and treats CSS custom
  properties as the source of truth, so tokens live in `app/src/tokens.css` and the design intent
  in `DESIGN.md`.
- **E2e tests run on Chromium only.** The skill also calls for Firefox and WebKit; only Chromium
  is installed in this environment.
- **`npm run serve` invokes zws via `java --source 25`** (zws is a single-file Java 25 script).
  The server prints a `HeadlessException` because it cannot open a browser without X11 — that is
  cosmetic; it still serves the files.

## A note on the vendored engine

`spessasynth_core.js` is **one self-contained ESM file with not a single import** — which is
what makes it vendorable without a bundler. It does, however, embed a Vorbis decoder (stb_vorbis
as WebAssembly in a data URI), needed for SF3 banks. It fetches nothing over the network and
behaves the same in Node and in an AudioWorklet, but that means **you must wait for
`processorInitialized` before the first note**: an SF3 bank decoded before the decoder is ready
produces silence and remembers it permanently. The worklet queues a play request until it is
ready.

## Status

- **M0** — scaffold, vendored libraries, audio plumbing, CI.
- **M1 / M1a** — XMI parser (IFF container, interval bytes, note durations, `RBRN`, `116`/`117`
  loops, tempo, names, stubs), verified against a real THM1.XMI.
- **M2** — timeline (note-offs from durations, tick→sample), transport (quantizing variant
  switches to the loop boundary, event log), SoundFont, `tools/render.js`, golden tests on the
  RMS envelope, and **audible sound in the browser**.

Next: a mood engine in the style of `mlimbs` (M3), a channel-layer mixer (M4), PWA and deploy
(M5).
