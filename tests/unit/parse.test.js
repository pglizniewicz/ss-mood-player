import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXmi, ticksPerBar, ticksPerQuarter, ticksToSeconds, loopBars } from "../../app/src/player/control/parse.js";
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
    // Meta events carry no sound, so they stay out of the stream the scheduler walks.
    assert.deepEqual(events.map(({ type }) => type), ["controller", "noteOn", "endOfTrack"]);
});

test("places bars from the tempo, so a loop lands on a whole number of them", () => {
    // The numbers come from System Shock's THM1.XMI: 130 BPM, 6/4, a four-bar loop of 1329 ticks.
    // At a fixed 120 Hz clock a quarter note spans 55.38 ticks, not the 60 a fixed PPQN implies.
    const file = buildXmi([{
        tempo: 461_538,
        timeSignature: [6, 4],
        events: [
            { type: "loopStart" },
            { type: "noteOn", channel: 9, note: 36, duration: 30 },
            { delta: 1329, type: "loopEnd" }
        ]
    }]);

    const [sequence] = parseXmi(file).sequences;

    assert.equal(sequence.tempoMicroseconds, 461_538);
    assert.ok(Math.abs(ticksPerQuarter(sequence) - 55.3846) < 0.001);
    assert.ok(Math.abs(ticksPerBar(sequence) - 332.3077) < 0.001);
    assert.deepEqual(
        { startTick: sequence.loop.startTick, ticks: sequence.loop.ticks, repeats: sequence.loop.repeats },
        { startTick: 0, ticks: 1329, repeats: 0 }
    );
    assert.equal(Math.round(loopBars(sequence)), 4);
    assert.ok(Math.abs(loopBars(sequence) - 4) < 0.01);
});

test("reads labels and tells playable sequences from marker-only stubs", () => {
    const file = buildXmi([
        {
            events: [
                { type: "trackName", text: "keeper" },
                { type: "noteOn", note: 60, duration: 60 }
            ]
        },
        { events: [{ type: "marker", text: "theme1 SCMIDIfile" }] }
    ]);

    const [playable, stub] = parseXmi(file).sequences;

    assert.equal(playable.name, "keeper");
    assert.equal(playable.isPlayable, true);
    assert.deepEqual(stub.labels, [{ tick: 0, kind: "marker", text: "theme1 SCMIDIfile" }]);
    // 19 of the 50 sequences in THM1.XMI are stubs like this one; the UI has to separate them.
    assert.equal(stub.isPlayable, false);
    // Without a tempo event the file falls back to 120 BPM, the AIL-era default.
    assert.equal(stub.tempoMicroseconds, 500_000);
});
