import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXmi, ticksPerBar, ticksToSeconds } from "../../app/src/player/control/parse.js";
import { buildXmi } from "../fixtures/build-xmi.js";

test("reads every sequence of the file with its declared metadata", () => {
    const file = buildXmi([
        {
            timbres: [{ patch: 48, bank: 0 }],
            events: [
                { type: "programChange", channel: 2, program: 48 },
                { type: "noteOn", channel: 2, note: 60, velocity: 100, duration: 60 }
            ]
        },
        {
            timeSignature: [3, 4],
            events: [{ type: "noteOn", channel: 5, note: 48, velocity: 90, duration: 30 }]
        }
    ]);

    const { sequences, declaredSequenceCount } = parseXmi(file);

    assert.equal(declaredSequenceCount, 2);
    assert.equal(sequences.length, 2);
    assert.deepEqual(sequences[0].timbres, [{ patch: 48, bank: 0 }]);
    assert.deepEqual(sequences[0].channels, [2]);
    assert.deepEqual(sequences[1].timeSignature, { numerator: 3, denominator: 4 });
    assert.equal(ticksPerBar(sequences[0]), 240);
    assert.equal(ticksPerBar(sequences[1]), 180);

    // Single-sequence files are also stored as a bare FORM/XMID without the XDIR wrapper.
    const bare = parseXmi(buildXmi([{ events: [{ type: "noteOn", note: 60, duration: 60 }] }], { omitDirectory: true }));
    assert.equal(bare.sequences.length, 1);
    assert.equal(bare.declaredSequenceCount, 0);
});

test("sums interval bytes and keeps note durations instead of note-off events", () => {
    const file = buildXmi([{
        events: [
            { type: "noteOn", note: 60, duration: 60 },
            { delta: 200, type: "noteOn", note: 62, duration: 0 },
            { delta: 40, type: "noteOn", note: 64, duration: 300 }
        ]
    }]);

    const [{ events, durationTicks }] = parseXmi(file).sequences;
    const notes = events.filter(({ type }) => type === "noteOn");

    assert.deepEqual(notes.map(({ tick }) => tick), [0, 200, 240]);
    // A zero-length note becomes one tick: the AIL driver plays it very briefly and a
    // literal zero would stall the note-off queue.
    assert.deepEqual(notes.map(({ duration }) => duration), [60, 1, 300]);
    // The stream ends when the last note stops sounding, not at the last event's tick.
    assert.equal(durationTicks, 540);
    assert.equal(ticksToSeconds(240), 2);
    assert.ok(events.some(({ type }) => type === "endOfTrack"));
});

test("resolves RBRN branch points to ticks and stream positions", () => {
    const file = buildXmi([{
        events: [
            { type: "branch", index: 0 },
            { type: "noteOn", note: 60, duration: 60 },
            { delta: 240, type: "branch", index: 3 },
            { type: "noteOn", note: 67, duration: 60 }
        ]
    }]);

    const [{ branches, events }] = parseXmi(file).sequences;

    assert.deepEqual(branches.map(({ index }) => index), [0, 3]);
    assert.deepEqual(branches.map(({ tick }) => tick), [0, 240]);
    assert.deepEqual(
        branches.map(({ eventIndex }) => events[eventIndex].type),
        ["controller", "controller"]
    );
});

test("falls back to controller 120 marks when the file has no branch table", () => {
    const file = buildXmi([{
        omitBranchTable: true,
        events: [
            { type: "tempo" },
            { delta: 120, type: "branch", index: 7 },
            { type: "noteOn", note: 60, duration: 60 }
        ]
    }]);

    const [{ branches, events }] = parseXmi(file).sequences;

    assert.deepEqual(branches.map(({ index, tick }) => ({ index, tick })), [{ index: 7, tick: 120 }]);
    // Tempo meta events survive conversion to XMI but must not reach the event stream.
    assert.deepEqual(events.map(({ type }) => type), ["timeSignature", "controller", "noteOn", "endOfTrack"]);
});
