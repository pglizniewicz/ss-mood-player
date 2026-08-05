/**
 * Applies timeline actions to a synthesizer. Shared by the audio worklet and by the offline
 * renderer so both speak to the synthesizer identically — a difference here would make the
 * golden WAV files meaningless as evidence about the browser.
 *
 * The synthesizer arrives as an argument rather than an import: that keeps this module free of
 * Web Audio and testable against a recording stub.
 *
 * @typedef {object} Sink
 * @property {(channel: number, note: number, velocity: number) => void} noteOn
 * @property {(channel: number, note: number) => void} noteOff
 * @property {(channel: number, controller: number, value: number) => void} controllerChange
 * @property {(channel: number, program: number) => void} programChange
 * @property {(channel: number, pitch: number) => void} pitchWheel
 * @property {(channel: number, pressure: number) => void} channelPressure
 * @property {(channel: number, note: number, pressure: number) => void} polyPressure
 */

/** MIDI splits the pitch wheel into two 7-bit halves; the synthesizer wants the 14-bit value. */
const toPitchWheel = (lsb, msb) => ((msb & 0x7f) << 7) | (lsb & 0x7f);

/**
 * @param {import("./timeline.js").Action} action what to do
 * @param {Sink} synth the synthesizer to do it to
 * @returns {void}
 */
export const apply = (action, synth) => {
    const { type, channel = 0, data1 = 0, data2 = 0 } = action;

    if (type === "noteOn") return synth.noteOn(channel, data1, data2);
    if (type === "noteOff") return synth.noteOff(channel, data1);
    if (type === "controller") return synth.controllerChange(channel, data1, data2);
    if (type === "programChange") return synth.programChange(channel, data1);
    if (type === "pitchWheel") return synth.pitchWheel(channel, toPitchWheel(data1, data2));
    if (type === "channelPressure") return synth.channelPressure(channel, data1);
    if (type === "polyPressure") return synth.polyPressure(channel, data1, data2);
    // segmentEnded is for the transport, not for the synthesizer.
};

const VOLUME = 7;
const PAN = 10;
const CENTRE = 64;
const PITCH_WHEEL_CENTRE = 8_192;

/**
 * Actions that put channels back to a known state before a segment starts, so a variant cannot
 * inherit the volume, pan or bend the previous one happened to leave behind. Returned as actions
 * rather than applied directly, so everything the synthesizer hears travels the same path.
 *
 * @param {number[]} channels the channels the segment uses
 * @returns {import("./timeline.js").Action[]} the reset actions, all at sample 0
 */
export const resetActions = channels =>
    channels.flatMap(channel => [
        { sample: 0, tick: 0, type: /** @type {const} */ ("controller"), channel, data1: VOLUME, data2: 100 },
        { sample: 0, tick: 0, type: /** @type {const} */ ("controller"), channel, data1: PAN, data2: CENTRE },
        {
            sample: 0,
            tick: 0,
            type: /** @type {const} */ ("pitchWheel"),
            channel,
            data1: PITCH_WHEEL_CENTRE & 0x7f,
            data2: (PITCH_WHEEL_CENTRE >> 7) & 0x7f
        }
    ]);
