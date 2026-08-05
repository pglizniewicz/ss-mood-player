import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXmi } from "../../app/src/player/control/parse.js";
import { expand } from "../../app/src/player/control/timeline.js";
import { apply } from "../../app/src/player/control/dispatch.js";
import { buildXmi } from "../fixtures/build-xmi.js";

const SAMPLE_RATE = 48_000;
const SAMPLES_PER_TICK = SAMPLE_RATE / 120;

/**
 * @param {import("../fixtures/build-xmi.js").FixtureSequence} sequence the fixture to expand
 * @returns {import("../../app/src/player/control/timeline.js").Timeline} its timeline
 */
const timelineOf = sequence => {
    const [parsed] = parseXmi(buildXmi([sequence])).sequences;
    return expand(parsed, SAMPLE_RATE);
};

test("turns note durations into note-off actions at the right sample", () => {
    const { actions, samplesPerTick } = timelineOf({
        events: [
            { type: "noteOn", channel: 3, note: 60, velocity: 100, duration: 60 },
            { delta: 120, type: "noteOn", channel: 3, note: 67, velocity: 90, duration: 30 }
        ]
    });

    assert.equal(samplesPerTick, SAMPLES_PER_TICK);
    assert.deepEqual(
        actions.filter(({ type }) => type !== "segmentEnded").map(({ type, tick, data1 }) => ({ type, tick, data1 })),
        [
            { type: "noteOn", tick: 0, data1: 60 },
            { type: "noteOff", tick: 60, data1: 60 },
            { type: "noteOn", tick: 120, data1: 67 },
            { type: "noteOff", tick: 150, data1: 67 }
        ]
    );
    assert.equal(actions.find(({ type }) => type === "noteOff").sample, Math.round(60 * SAMPLES_PER_TICK));
});

test("stops at the loop end and reports the sequencer controllers it withheld", () => {
    const { actions, endTick, endSample, sequencerControllers } = timelineOf({
        tempo: 461_538,
        timeSignature: [6, 4],
        events: [
            { type: "loopStart" },
            { type: "controller", controller: 7, value: 100 },
            { type: "noteOn", channel: 9, note: 36, duration: 2_000 },
            { delta: 1329, type: "loopEnd" }
        ]
    });

    assert.equal(endTick, 1329);
    assert.equal(endSample, Math.round(1329 * SAMPLES_PER_TICK));
    // 116 and 117 steer the sequencer, so they never reach the synthesizer.
    assert.deepEqual(sequencerControllers, [116, 117]);
    assert.deepEqual(actions.map(({ type }) => type), ["controller", "noteOn", "noteOff", "segmentEnded"]);
    // A note whose duration outlasts the segment is cut at the end rather than left hanging.
    assert.equal(actions.find(({ type }) => type === "noteOff").tick, 1329);
    assert.equal(actions.at(-1).type, "segmentEnded");
});

test("orders coinciding actions so nothing sounds with the wrong settings", () => {
    const { actions } = timelineOf({
        events: [
            { type: "noteOn", channel: 1, note: 60, duration: 120 },
            // At tick 120 the first note stops, the program changes and a new note starts.
            { delta: 120, type: "programChange", channel: 1, program: 48 },
            { type: "noteOn", channel: 1, note: 62, duration: 60 }
        ]
    });

    const atTick120 = actions.filter(({ tick }) => tick === 120).map(({ type }) => type);
    assert.deepEqual(atTick120, ["noteOff", "programChange", "noteOn"]);
});

test("dispatch maps actions onto the synthesizer, splitting the pitch wheel into 14 bits", () => {
    /** @type {string[]} */
    const calls = [];
    const synth = {
        noteOn: (...args) => calls.push(`noteOn ${args}`),
        noteOff: (...args) => calls.push(`noteOff ${args}`),
        controllerChange: (...args) => calls.push(`cc ${args}`),
        programChange: (...args) => calls.push(`program ${args}`),
        pitchWheel: (...args) => calls.push(`bend ${args}`),
        channelPressure: (...args) => calls.push(`pressure ${args}`),
        polyPressure: (...args) => calls.push(`poly ${args}`)
    };

    apply({ sample: 0, tick: 0, type: "noteOn", channel: 2, data1: 60, data2: 100 }, synth);
    // LSB 0x00, MSB 0x40 is the centre: (0x40 << 7) | 0 = 8192.
    apply({ sample: 0, tick: 0, type: "pitchWheel", channel: 2, data1: 0x00, data2: 0x40 }, synth);
    apply({ sample: 0, tick: 0, type: "segmentEnded" }, synth);

    assert.deepEqual(calls, ["noteOn 2,60,100", "bend 2,8192"]);
});
