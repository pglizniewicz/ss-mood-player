import { TICK_RATE } from "./parse.js";

/**
 * Turns a parsed sequence into a flat, sorted list of things to do to a synthesizer, with each
 * one placed at a sample position. This is the whole timing model of the player, and it is a
 * pure function so it can be tested without any audio at all.
 *
 * Two XMI specifics are resolved here: a note carries its duration instead of being paired with
 * a note-off, and the XMIDI controllers (110-120) are instructions to the sequencer rather than
 * to the synthesizer.
 *
 * @typedef {"noteOn" | "noteOff" | "controller" | "programChange" | "pitchWheel"
 *   | "channelPressure" | "polyPressure" | "segmentEnded"} ActionType
 *
 * @typedef {object} Action
 * @property {number} sample where it happens, relative to the segment start
 * @property {number} tick the same position in XMI ticks
 * @property {ActionType} type
 * @property {number} [channel] MIDI channel 0-15
 * @property {number} [data1] note, controller number or program
 * @property {number} [data2] velocity or value
 *
 * @typedef {object} Timeline
 * @property {Action[]} actions everything to do, ordered by sample
 * @property {number} endTick where the segment stops: the loop end, or the last tick
 * @property {number} endSample the same position in samples
 * @property {number} samplesPerTick the conversion factor used
 * @property {number[]} sequencerControllers XMIDI controller numbers seen and not passed on
 */

const XMIDI_CONTROLLER_FIRST = 110;
const XMIDI_CONTROLLER_LAST = 120;

/** Sounding notes must stop before new ones start, and programs must be set before they sound. */
const ORDER = new Map([
    ["noteOff", 0],
    ["controller", 1],
    ["programChange", 1],
    ["pitchWheel", 1],
    ["channelPressure", 1],
    ["polyPressure", 1],
    ["noteOn", 2],
    ["segmentEnded", 3]
]);

const PASSED_THROUGH = new Set([
    "controller",
    "programChange",
    "pitchWheel",
    "channelPressure",
    "polyPressure"
]);

/**
 * @param {number} controller a controller number
 * @returns {boolean} whether it addresses the sequencer instead of the synthesizer
 */
export const isSequencerController = controller =>
    controller >= XMIDI_CONTROLLER_FIRST && controller <= XMIDI_CONTROLLER_LAST;

/**
 * The tick-domain half of the expansion: this is where XMI's note durations become note-offs and
 * where sequencer controllers are withheld. Kept separate from the sample mapping so the MIDI
 * exporter, which has no sample rate, shares exactly this logic.
 *
 * @param {import("./parse.js").XmiSequence} sequence the sequence to expand
 * @returns {{actions: Omit<Action, "sample">[], endTick: number, sequencerControllers: number[]}} the actions in ticks
 */
export const expandTicks = sequence => {
    const endTick = sequence.loop?.endTick ?? sequence.durationTicks;
    /** @type {Omit<Action, "sample">[]} */
    const actions = [];
    /** @type {Set<number>} */
    const sequencerControllers = new Set();

    for (const event of sequence.events) {
        if (event.tick > endTick) break;

        if (event.type === "noteOn") {
            actions.push(toAction(event, "noteOn", event.tick));
            // Clamping the note-off keeps a long tail from hanging past the segment; the
            // transport also silences the channel when it leaves a segment.
            const offTick = Math.min(event.tick + (event.duration ?? 1), endTick);
            actions.push({
                tick: offTick,
                type: "noteOff",
                channel: event.channel,
                data1: event.data1
            });
            continue;
        }

        if (event.type === "noteOff") {
            actions.push(toAction(event, "noteOff", event.tick));
            continue;
        }

        if (event.type === "controller" && isSequencerController(event.data1 ?? 0)) {
            sequencerControllers.add(event.data1 ?? 0);
            continue;
        }

        if (PASSED_THROUGH.has(event.type)) {
            actions.push(toAction(event, /** @type {ActionType} */ (event.type), event.tick));
        }
    }

    actions.push({ tick: endTick, type: "segmentEnded" });

    return {
        actions: sort(actions),
        endTick,
        sequencerControllers: [...sequencerControllers].toSorted((left, right) => left - right)
    };
};

/**
 * @param {import("./parse.js").XmiSequence} sequence the sequence to expand
 * @param {number} sampleRate the rate the synthesizer runs at
 * @returns {Timeline} everything needed to play the segment once
 */
export const expand = (sequence, sampleRate) => {
    const samplesPerTick = sampleRate / TICK_RATE;
    const { actions, endTick, sequencerControllers } = expandTicks(sequence);

    return {
        actions: actions.map(action => ({ ...action, sample: Math.round(action.tick * samplesPerTick) })),
        endTick,
        endSample: Math.round(endTick * samplesPerTick),
        samplesPerTick,
        sequencerControllers
    };
};

/**
 * @param {import("./events.js").XmiEvent} event the parsed event
 * @param {ActionType} type the action to emit
 * @param {number} tick where it happens
 * @returns {Omit<Action, "sample">} the action
 */
const toAction = (event, type, tick) => ({
    tick,
    type,
    channel: event.channel,
    data1: event.data1,
    data2: event.data2
});

/**
 * @param {Omit<Action, "sample">[]} actions the unsorted actions
 * @returns {Omit<Action, "sample">[]} the same actions ordered by tick, then by what must happen first
 */
const sort = actions =>
    actions
        .map((action, position) => ({ action, position }))
        .toSorted((left, right) =>
            left.action.tick - right.action.tick ||
            (ORDER.get(left.action.type) ?? 1) - (ORDER.get(right.action.type) ?? 1) ||
            left.position - right.position)
        .map(({ action }) => action);
