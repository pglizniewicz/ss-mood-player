import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXmi } from "../../app/src/player/control/parse.js";
import { BasicMIDI } from "../../app/src/libs/spessasynth_core.js";
import { toMidi } from "../../tools/midi.js";
import { buildXmi } from "../fixtures/build-xmi.js";

/**
 * The exported file is read back with the synthesizer's own MIDI parser rather than with anything
 * written here: an independent reader is the only thing that can confirm the writer.
 *
 * @param {import("../fixtures/build-xmi.js").FixtureSequence} fixture the sequence to round-trip
 * @returns {{written: import("../../app/src/player/control/parse.js").XmiSequence, read: object}} both sides
 */
const roundTrip = fixture => {
    const [written] = parseXmi(buildXmi([fixture])).sequences;
    const midi = toMidi(written);
    const read = BasicMIDI.fromArrayBuffer(midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength));
    return { written, read };
};

test("every note survives the export, with its pitch, channel and velocity", () => {
    const { written, read } = roundTrip({
        tempo: 461_538,
        timeSignature: [6, 4],
        events: [
            { type: "loopStart" },
            { type: "programChange", channel: 12, program: 81 },
            { type: "noteOn", channel: 12, note: 73, velocity: 110, duration: 12 },
            { delta: 14, type: "noteOn", channel: 12, note: 73, velocity: 110, duration: 12 },
            { delta: 14, type: "noteOn", channel: 9, note: 42, velocity: 117, duration: 5 },
            { delta: 1301, type: "loopEnd" }
        ]
    });

    const expected = written.events
        .filter(({ type }) => type === "noteOn")
        .map(({ channel, data1, data2 }) => `${channel}:${data1}:${data2}`);
    const actual = read.tracks
        .flatMap(track => track.events)
        .filter(event => (event.statusByte & 0xf0) === 0x90 && event.data[1] > 0)
        .map(event => `${event.statusByte & 0x0f}:${event.data[0]}:${event.data[1]}`);

    assert.deepEqual(actual, expected);
    assert.equal(actual.length, 3);
    // The pitch the listener hears is the pitch the XMI holds: C#5 stays 73.
    assert.ok(actual.includes("12:73:110"));
});

test("tempo, time signature and note timing come through unchanged", () => {
    const { written, read } = roundTrip({
        tempo: 461_538,
        timeSignature: [6, 4],
        events: [
            { type: "loopStart" },
            { type: "noteOn", channel: 0, note: 60, velocity: 100, duration: 12 },
            // 1329 ticks is four bars at 130 BPM in 6/4.
            { delta: 1329, type: "loopEnd" }
        ]
    });

    assert.equal(written.tempoMicroseconds, 461_538);
    assert.equal(read.timeDivision, 480);

    // `duration` stops at the last sounding note, so the segment's true length is read from the
    // end-of-track event: four bars at 130 BPM in 6/4 is 11.08 seconds.
    const endOfTrack = read.tracks[0].events.at(-1);
    assert.equal(endOfTrack.statusByte, 0x2f);
    const seconds = (endOfTrack.ticks / read.timeDivision) * (written.tempoMicroseconds / 1_000_000);
    assert.ok(Math.abs(seconds - 11.08) < 0.05, `expected about 11.08 s, got ${seconds}`);
});
