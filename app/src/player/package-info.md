# player

Loads an XMI (XMIDI) file, plays it, and lets the listener change the musical variant while
it is playing — by sequence, by branch point, or by channel layer.

## Design decisions

- The store holds only plain, cloneable data. `structuredClone()` backs every reducer, and the
  parsed event streams are large and repeatedly indexed, so parsed sequences stay in a
  module-level cache in the control layer while the store keeps the metadata the UI renders
  (sequence list, branch indices, channel states, transport position).
- The XMI timeline is owned by this application rather than by the synthesizer. XMI encodes note
  durations instead of note-off events and jumps between branch points at runtime, which no MIDI
  sequencer models; `spessasynth_core` is therefore driven note by note and never handed a file.
- `AudioOut` is the only module that touches Web Audio. Control and entity stay free of it so the
  parser, scheduler and variant state machine run under `node --test`.
- **Variants carry keys.** System Shock's THM1.XMI holds 50 four-bar modules that fall into tonal
  groups — A, C, D, E, F, G and B — and sequence 10 is sequence 9 moved to E (identical rhythm,
  guitar a constant -5 semitones, bass +7, the lead recomposed over the new root). A mood engine
  that switches between modules of different roots produces a key change, so switching stays
  within a group unless a bridging module is used. The order the game itself uses is not in the
  XMI: it lives in `SOUND/THM1.DAT` and `SOUND/THM1.BIN`, which this project does not have, so any
  sequencing here is our own heuristic and is labelled as such in the UI.
- Variant changes are quantized to a bar boundary by default. Jumping mid-bar is available, and
  whether active notes are cut or held across the jump is the listener's choice — that switch is
  what makes a change sound like an edit or like a transition.
