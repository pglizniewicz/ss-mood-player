import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXmi } from "../../app/src/player/control/parse.js";
import { createTransport } from "../../app/src/player/control/transport.js";
import { renderSegments, rmsWindows, BLOCK } from "../../app/src/player/control/render.js";
import { BasicSoundBank, SoundBankLoader, SpessaSynthProcessor } from "../../app/src/libs/spessasynth_core.js";
import { buildXmi } from "../fixtures/build-xmi.js";

const SAMPLE_RATE = 48_000;
const WINDOW_MS = 100;

/** Half a second of silence, then a held note, then silence again. */
const FILE = buildXmi([{
    events: [
        { type: "loopStart" },
        // 60 ticks at 120 Hz is half a second.
        { delta: 60, type: "programChange", channel: 0, program: 0 },
        { type: "noteOn", channel: 0, note: 60, velocity: 110, duration: 120 },
        { delta: 240, type: "loopEnd" }
    ]
}]);

/**
 * Renders the fixture with the synthesizer's own built-in sample bank, so the test needs no
 * sound bank file and CI does not depend on the committed one.
 *
 * @param {number} seconds how long to render
 * @returns {Promise<{left: Float32Array, right: Float32Array, log: object[]}>} the audio
 */
const renderFixture = async seconds => {
    const { sequences } = parseXmi(FILE);
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        eventsEnabled: false,
        effectsEnabled: false,
        maxBufferSize: BLOCK,
        initialTime: 0
    });
    await synth.processorInitialized;
    synth.setSystemParameter("autoAllocateVoices", true);
    synth.setSystemParameter("interpolationType", 2);
    synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(BasicSoundBank.getSampleSoundBankFile()),
        "main"
    );

    const transport = createTransport({
        sampleRate: SAMPLE_RATE,
        sequenceAt: index => sequences[index],
        repeatSegment: false
    });
    transport.start(0);

    const { left, right } = renderSegments({
        synth,
        transport,
        totalSamples: Math.round(seconds * SAMPLE_RATE)
    });
    return { left, right, log: transport.log() };
};

test("renders silence before the note and sound after it", async () => {
    const { left, right } = await renderFixture(2);
    const envelope = rmsWindows(left, right, SAMPLE_RATE, WINDOW_MS);

    // Windows are 100 ms, so the note starts in window 5.
    const before = envelope.slice(0, 5);
    const during = envelope.slice(5, 10);

    assert.ok(before.every(({ rms }) => rms < 1e-6), `expected silence, got ${before.map(({ rms }) => rms)}`);
    assert.ok(during.every(({ rms }) => rms > 1e-3), `expected sound, got ${during.map(({ rms }) => rms)}`);
    // The note lasts one second and then releases, so the tail is quieter than the note.
    assert.ok(envelope.at(-1).rms < during[0].rms);
});

test("the same input renders the same envelope twice", async () => {
    const first = rmsWindows(...Object.values(await renderFixture(2)).slice(0, 2), SAMPLE_RATE, WINDOW_MS);
    const second = rmsWindows(...Object.values(await renderFixture(2)).slice(0, 2), SAMPLE_RATE, WINDOW_MS);

    assert.equal(first.length, second.length);
    for (const [window, { rms }] of first.entries()) {
        // Compared with a tolerance rather than byte-for-byte: floating point maths is not
        // bit-specified across platforms, so an exact hash would be a flaky test.
        const other = second[window].rms;
        const allowed = Math.max(rms, other) * 0.01 + 1e-9;
        assert.ok(
            Math.abs(rms - other) <= allowed,
            `window ${window} drifted: ${rms} vs ${other}`
        );
    }
});

test("a queued variant switch keeps the sound going past the segment end", async () => {
    const twoSegments = buildXmi([
        {
            events: [
                { type: "loopStart" },
                { type: "noteOn", channel: 0, note: 60, velocity: 110, duration: 120 },
                { delta: 120, type: "loopEnd" }
            ]
        },
        {
            events: [
                { type: "loopStart" },
                { type: "noteOn", channel: 0, note: 67, velocity: 110, duration: 120 },
                { delta: 120, type: "loopEnd" }
            ]
        }
    ]);

    const { sequences } = parseXmi(twoSegments);
    const synth = new SpessaSynthProcessor(SAMPLE_RATE, {
        eventsEnabled: false,
        effectsEnabled: false,
        maxBufferSize: BLOCK,
        initialTime: 0
    });
    await synth.processorInitialized;
    synth.soundBankManager.addSoundBank(
        SoundBankLoader.fromArrayBuffer(BasicSoundBank.getSampleSoundBankFile()),
        "main"
    );

    const transport = createTransport({
        sampleRate: SAMPLE_RATE,
        sequenceAt: index => sequences[index],
        repeatSegment: false
    });
    transport.start(0);
    transport.requestSequence(1);

    // Each segment lasts a second, so 2.5 s covers both and the boundary that ends the second.
    const { left, right } = renderSegments({ synth, transport, totalSamples: 2.5 * SAMPLE_RATE });
    const envelope = rmsWindows(left, right, SAMPLE_RATE, WINDOW_MS);

    // The first segment ends at tick 120, one second in; the second segment must be sounding
    // after that instead of the render falling silent.
    assert.ok(envelope[11].rms > 1e-3, `expected the switched-to segment to sound, got ${envelope[11].rms}`);
    assert.deepEqual(
        transport.log().map(({ kind }) => kind),
        ["started", "requested", "segmentEnded", "switched", "segmentEnded", "stopped"]
    );
});
