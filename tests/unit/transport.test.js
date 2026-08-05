import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXmi } from "../../app/src/player/control/parse.js";
import { createTransport } from "../../app/src/player/control/transport.js";
import { buildXmi } from "../fixtures/build-xmi.js";

const SAMPLE_RATE = 48_000;
const SAMPLES_PER_TICK = SAMPLE_RATE / 120;
const WINDOW = 128;

/** Two four-bar-ish segments and one empty stub, the shape a System Shock theme file has. */
const FILE = buildXmi([
    {
        events: [
            { type: "loopStart" },
            { type: "noteOn", channel: 0, note: 60, duration: 60 },
            { delta: 240, type: "loopEnd" }
        ]
    },
    {
        events: [
            { type: "loopStart" },
            { type: "noteOn", channel: 1, note: 67, duration: 60 },
            { delta: 240, type: "loopEnd" }
        ]
    },
    { events: [{ type: "marker", text: "theme1 SCMIDIfile" }] }
]);

/**
 * @param {object} [options] transport options to override
 * @returns {object} a transport over the fixture above
 */
const transportOf = (options = {}) => {
    const { sequences } = parseXmi(FILE);
    return createTransport({ sampleRate: SAMPLE_RATE, sequenceAt: index => sequences[index], ...options });
};

/**
 * Renders nothing — it only walks the transport window by window, collecting what it emits.
 *
 * @param {object} transport the transport to run
 * @param {number} windows how many 128-sample windows to advance
 * @returns {{sample: number, type: string, channel: number | undefined}[]} the actions emitted
 */
const run = (transport, windows) =>
    Array.from({ length: windows }, (_, window) => window)
        .flatMap(window => transport.advance(WINDOW).map(({ offset, action }) => ({
            sample: window * WINDOW + offset,
            type: action.type,
            channel: action.channel
        })));

test("a switch requested mid-segment takes effect exactly at the segment end", () => {
    const transport = transportOf();
    transport.start(0);

    // The segment is 240 ticks; ask for another variant a quarter of the way in.
    const windowsToBoundary = Math.ceil((240 * SAMPLES_PER_TICK) / WINDOW);
    run(transport, Math.floor(windowsToBoundary / 4));
    assert.deepEqual(transport.requestSequence(1), []);
    assert.equal(transport.state().pending, 1);

    const emitted = run(transport, windowsToBoundary);

    assert.equal(transport.state().sequence, 1);
    assert.equal(transport.state().pending, undefined);
    const kinds = transport.log().map(({ kind, sequence }) => `${kind}:${sequence}`);
    assert.deepEqual(kinds, ["started:0", "requested:1", "segmentEnded:0", "switched:1"]);
    // The switch entry sits at the boundary tick, not where the request was made.
    assert.equal(transport.log().find(({ kind }) => kind === "segmentEnded").tick, 240);
    // Channel 1 only sounds after the switch.
    assert.ok(emitted.some(({ type, channel }) => type === "noteOn" && channel === 1));
});

test("an immediate switch silences what is sounding and starts at once", () => {
    const transport = transportOf();
    transport.start(0);
    run(transport, 2);

    const scheduled = transport.requestSequence(1, "now");

    assert.equal(transport.state().sequence, 1);
    // The note started in segment 0 is stopped before the new segment's resets arrive.
    assert.equal(scheduled[0].action.type, "noteOff");
    assert.equal(scheduled[0].action.channel, 0);
    assert.deepEqual(
        transport.log().map(({ kind }) => kind),
        ["started", "requested", "switched"]
    );
});

test("repeats a segment by default and stops on one that holds no note", () => {
    const repeating = transportOf();
    repeating.start(0);
    run(repeating, Math.ceil((240 * SAMPLES_PER_TICK) / WINDOW) + 1);
    assert.deepEqual(
        repeating.log().map(({ kind }) => kind),
        ["started", "segmentEnded", "repeated"]
    );
    assert.equal(repeating.state().stopped, false);

    // Sequence 2 is a marker-only stub: repeating it forever would spin inside one window.
    const stub = transportOf();
    stub.start(2);
    stub.advance(WINDOW);
    assert.equal(stub.state().stopped, true);
    assert.equal(stub.log().find(({ kind }) => kind === "stopped").reason, "empty segment");
});

test("playing once stops at the end instead of repeating", () => {
    const transport = transportOf({ repeatSegment: false });
    transport.start(0);
    run(transport, Math.ceil((240 * SAMPLES_PER_TICK) / WINDOW) + 1);

    assert.equal(transport.state().stopped, true);
    assert.equal(transport.log().at(-1).reason, "played once");
});
