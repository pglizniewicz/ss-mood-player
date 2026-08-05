/**
 * Writes a parsed XMI sequence as a standard MIDI file.
 *
 * This exists to settle a question no amount of internal testing can: whether the notes this
 * project reads out of an XMI are the notes the file contains. Exported as a `.mid`, the same
 * data can be played by any other player, synthesizer or DAW.
 *
 * The note data comes from `expandTicks`, the same function that feeds the audio worklet, so the
 * export cannot drift from what the player does.
 */

import { expandTicks } from "../app/src/player/control/timeline.js";
import { ticksPerQuarter } from "../app/src/player/control/parse.js";

/** Fine enough that rounding XMI ticks onto it stays under a millisecond of error. */
const PULSES_PER_QUARTER = 480;

/**
 * @param {number} value a delta time
 * @returns {number[]} its variable-length encoding
 */
const variableLength = value => {
    const bytes = [value & 0x7f];
    let remaining = value >>> 7;
    while (remaining > 0) {
        bytes.unshift((remaining & 0x7f) | 0x80);
        remaining >>>= 7;
    }
    return bytes;
};

/**
 * @param {string} text ASCII text
 * @returns {number[]} its bytes
 */
const ascii = text => [...text].map(character => character.charCodeAt(0) & 0x7f);

/**
 * @param {number} value a 32-bit number
 * @returns {number[]} four big-endian bytes
 */
const uint32BE = value => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];

/**
 * @param {import("../app/src/player/control/timeline.js").Action} action what to emit
 * @returns {number[]} the MIDI message, empty for actions the file cannot carry
 */
const message = action => {
    const channel = action.channel ?? 0;
    const { data1 = 0, data2 = 0 } = action;

    if (action.type === "noteOn") return [0x90 | channel, data1, data2];
    if (action.type === "noteOff") return [0x80 | channel, data1, 0];
    if (action.type === "controller") return [0xb0 | channel, data1, data2];
    if (action.type === "programChange") return [0xc0 | channel, data1];
    if (action.type === "pitchWheel") return [0xe0 | channel, data1, data2];
    if (action.type === "channelPressure") return [0xd0 | channel, data1];
    if (action.type === "polyPressure") return [0xa0 | channel, data1, data2];
    return [];
};

/**
 * @param {import("../app/src/player/control/parse.js").XmiSequence} sequence the sequence to write
 * @returns {Uint8Array} a format 0 MIDI file
 */
export const toMidi = sequence => {
    const { actions, endTick } = expandTicks(sequence);
    // XMI ticks are tied to the sequencer's fixed clock; scaling them onto a musical PPQ keeps
    // both the absolute timing and the bar lines that a DAW will draw.
    const scale = PULSES_PER_QUARTER / ticksPerQuarter(sequence);
    const { numerator, denominator } = sequence.timeSignature;

    const track = [
        ...variableLength(0), 0xff, 0x51, 0x03,
        (sequence.tempoMicroseconds >> 16) & 0xff,
        (sequence.tempoMicroseconds >> 8) & 0xff,
        sequence.tempoMicroseconds & 0xff,
        ...variableLength(0), 0xff, 0x58, 0x04, numerator, Math.log2(denominator), 24, 8
    ];

    const name = sequence.name || `sequence ${sequence.index}`;
    track.push(...variableLength(0), 0xff, 0x03, name.length, ...ascii(name));

    let previous = 0;
    for (const action of actions) {
        const bytes = message(action);
        if (bytes.length === 0) continue;
        const tick = Math.round(action.tick * scale);
        track.push(...variableLength(Math.max(0, tick - previous)), ...bytes);
        previous = tick;
    }
    // End the track where the segment ends, not after its last note: the trailing part of a loop
    // is silence that still belongs to the bar count.
    const endsAt = Math.round(endTick * scale);
    track.push(...variableLength(Math.max(0, endsAt - previous)), 0xff, 0x2f, 0x00);

    return Uint8Array.from([
        ...ascii("MThd"), ...uint32BE(6), 0x00, 0x00, 0x00, 0x01,
        (PULSES_PER_QUARTER >> 8) & 0xff, PULSES_PER_QUARTER & 0xff,
        ...ascii("MTrk"), ...uint32BE(track.length), ...track
    ]);
};
