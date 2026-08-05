import { apply } from "./dispatch.js";

/**
 * Renders a transport into sample buffers, applying every action at its exact sample by cutting
 * the render at action boundaries. Used by the offline renderer and by the golden tests, so both
 * exercise the same timing code as the audio worklet.
 *
 * The synthesizer is a parameter, so this module knows nothing about Web Audio.
 */

/**
 * The synthesizer updates modulators and LFOs once per `process()` call, so the block size is
 * part of the output, not an implementation detail. 128 matches the browser's render quantum.
 */
export const BLOCK = 128;

/**
 * @param {object} options what to render
 * @param {import("./dispatch.js").Sink & {process: Function}} options.synth the synthesizer
 * @param {object} options.transport the transport walking the timeline
 * @param {number} options.totalSamples how many samples to produce
 * @param {number} [options.block] samples per synthesizer call
 * @param {(channel: number) => boolean} [options.playsChannel] lets a caller solo or mute
 *   channels, which is how a listener finds out which line is which
 * @param {(channel: number) => number} [options.transposeBy] semitones to shift a channel by,
 *   for testing whether a line was written where it sounds
 * @returns {{left: Float32Array, right: Float32Array}} the rendered audio
 */
export const renderSegments = ({
    synth,
    transport,
    totalSamples,
    block = BLOCK,
    playsChannel,
    transposeBy
}) => {
    // `process()` adds into the buffers rather than overwriting them, so every range must be
    // rendered exactly once into freshly zeroed arrays.
    const left = new Float32Array(totalSamples);
    const right = new Float32Array(totalSamples);
    let position = 0;

    while (position < totalSamples) {
        const size = Math.min(block, totalSamples - position);
        const scheduled = transport.advance(size);
        let written = 0;

        for (const { offset, action } of scheduled) {
            const target = Math.min(offset, size);
            if (target > written) {
                synth.process(left, right, position + written, target - written);
                written = target;
            }
            if (!playsChannel || action.channel === undefined || playsChannel(action.channel)) {
                apply(transposed(action, transposeBy), synth);
            }
        }
        if (written < size) synth.process(left, right, position + written, size - written);
        position += size;
    }

    return { left, right };
};

const NOTE_ACTIONS = new Set(["noteOn", "noteOff"]);

/**
 * @param {import("./timeline.js").Action} action the action to play
 * @param {((channel: number) => number) | undefined} transposeBy semitones per channel
 * @returns {import("./timeline.js").Action} the action, shifted when asked
 */
const transposed = (action, transposeBy) => {
    if (!transposeBy || action.channel === undefined || !NOTE_ACTIONS.has(action.type)) return action;
    const semitones = transposeBy(action.channel);
    if (semitones === 0) return action;
    return { ...action, data1: Math.max(0, Math.min(127, (action.data1 ?? 0) + semitones)) };
};

/**
 * @param {Float32Array} left one channel
 * @param {Float32Array} right the other
 * @param {number} sampleRate samples per second
 * @param {number} [windowMs] window length
 * @returns {{start: number, rms: number}[]} the RMS envelope, which is what audio assertions
 *   compare — raw samples drift between platforms, an envelope does not
 */
export const rmsWindows = (left, right, sampleRate, windowMs = 100) => {
    const size = Math.round((sampleRate * windowMs) / 1000);
    const count = Math.ceil(left.length / size);

    return Array.from({ length: count }, (_, window) => {
        const from = window * size;
        const to = Math.min(from + size, left.length);
        let sum = 0;
        for (let at = from; at < to; at += 1) sum += left[at] ** 2 + right[at] ** 2;
        return { start: from / sampleRate, rms: Math.sqrt(sum / (2 * (to - from))) };
    });
};
