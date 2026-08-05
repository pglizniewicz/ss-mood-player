import { test } from "node:test";
import assert from "node:assert/strict";
import { SpessaSynthProcessor } from "../../app/src/libs/spessasynth_core.js";

const SAMPLE_RATE = 48_000;
const RENDER_QUANTUM = 128;

test("the vendored synthesizer initializes and renders finite samples in Node", async () => {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, { eventsEnabled: false });
    await synth.processorInitialized;

    const left = new Float32Array(RENDER_QUANTUM);
    const right = new Float32Array(RENDER_QUANTUM);
    synth.process(left, right);

    assert.equal(synth.sampleRate, SAMPLE_RATE);
    assert.ok(left.every(Number.isFinite), "left channel must contain finite samples");
    assert.ok(right.every(Number.isFinite), "right channel must contain finite samples");
});

test("note events are accepted without a sound bank loaded", async () => {
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, { eventsEnabled: false });
    await synth.processorInitialized;

    synth.noteOn(0, 60, 100);
    synth.noteOff(0, 60);
    synth.process(new Float32Array(RENDER_QUANTUM), new Float32Array(RENDER_QUANTUM));

    assert.equal(synth.voiceCount, 0, "a missing sound bank must not leave voices allocated");
});
