import { expand } from "./timeline.js";
import { resetActions } from "./dispatch.js";

/**
 * Walks timelines and decides what happens when a segment ends: repeat it, move to a requested
 * variant, or stop. This is where "switch the variant" becomes "switch it at the loop boundary".
 *
 * It emits actions rather than touching a synthesizer, and records every decision in a
 * structured log — the log is what the tests assert on, because it says *when* and *why*
 * something happened, which samples cannot.
 *
 * @typedef {object} LogEntry
 * @property {number} sample position within the segment the entry concerns
 * @property {number} tick the same position in ticks
 * @property {"started" | "requested" | "segmentEnded" | "switched" | "repeated" | "stopped"} kind
 * @property {number} [sequence] the segment this concerns
 * @property {number} [from] previous segment, on a switch
 * @property {string} [reason] why it happened
 *
 * @typedef {object} Scheduled
 * @property {number} offset samples from the start of the requested window
 * @property {import("./timeline.js").Action} action what to do there
 */

/** A window can only cross so many segment boundaries before something is wrong. */
const MAX_BOUNDARIES_PER_WINDOW = 8;

/**
 * @param {object} options how the transport behaves
 * @param {number} options.sampleRate the synthesizer's rate
 * @param {(index: number) => (import("./parse.js").XmiSequence | undefined)} options.sequenceAt looks a segment up
 * @param {boolean} [options.repeatSegment] repeat the segment when nothing else is requested
 * @param {boolean} [options.cutOnSwitch] silence sounding notes when a switch happens mid-segment
 * @returns {object} the transport
 */
export const createTransport = ({ sampleRate, sequenceAt, repeatSegment = true, cutOnSwitch = true }) => {
    /** @type {LogEntry[]} */
    const log = [];
    /** @type {Set<number>} */
    const sounding = new Set();
    /** @type {import("./timeline.js").Timeline | undefined} */
    let timeline;
    let current = -1;
    let position = 0;
    let cursor = 0;
    /** @type {number | undefined} */
    let pending;
    let stopped = true;

    const tickOf = sample => (timeline ? Math.round(sample / timeline.samplesPerTick) : 0);

    const enter = (index, reason) => {
        const sequence = sequenceAt(index);
        if (!sequence) throw new Error(`no sequence at index ${index}`);
        const from = current;
        timeline = expand(sequence, sampleRate);
        current = index;
        position = 0;
        cursor = 0;
        stopped = false;
        log.push({
            sample: 0,
            tick: 0,
            kind: from === -1 ? "started" : "switched",
            sequence: index,
            ...(from === -1 ? {} : { from }),
            reason
        });
        return resetActions(sequence.channels);
    };

    const track = action => {
        if (action.channel === undefined || action.data1 === undefined) return;
        const key = action.channel * 128 + action.data1;
        if (action.type === "noteOn") sounding.add(key);
        if (action.type === "noteOff") sounding.delete(key);
    };

    /** @returns {import("./timeline.js").Action[]} note-offs for everything still sounding */
    const silence = () => {
        const offs = [...sounding].map(key => ({
            sample: 0,
            tick: 0,
            type: /** @type {const} */ ("noteOff"),
            channel: Math.floor(key / 128),
            data1: key % 128
        }));
        sounding.clear();
        return offs;
    };

    const stop = reason => {
        stopped = true;
        log.push({ sample: position, tick: tickOf(position), kind: "stopped", sequence: current, reason });
        return silence();
    };

    /** @returns {import("./timeline.js").Action[]} what the boundary decision produces */
    const handleSegmentEnd = () => {
        log.push({ sample: position, tick: tickOf(position), kind: "segmentEnded", sequence: current });
        const offs = silence();

        if (pending !== undefined) {
            const target = pending;
            pending = undefined;
            return [...offs, ...enter(target, "atSegmentEnd")];
        }
        if (repeatSegment && (timeline?.endSample ?? 0) > 0) {
            position = 0;
            cursor = 0;
            log.push({ sample: 0, tick: 0, kind: "repeated", sequence: current });
            return offs;
        }
        // A segment of zero length would otherwise repeat forever inside one window; 20 of the
        // 50 sequences in System Shock's THM1.XMI hold no note at all.
        return [...offs, ...stop(repeatSegment ? "empty segment" : "played once")];
    };

    return {
        /**
         * @param {number} index the segment to play
         * @returns {Scheduled[]} actions to apply before rendering continues
         */
        start: index => enter(index, "start").map(action => ({ offset: 0, action })),

        /**
         * @param {number} index the segment to move to
         * @param {"atSegmentEnd" | "now"} [when] when the move should take effect
         * @returns {Scheduled[]} actions to apply immediately, empty when the move is deferred
         */
        requestSequence: (index, when = "atSegmentEnd") => {
            log.push({ sample: position, tick: tickOf(position), kind: "requested", sequence: index, reason: when });
            if (when === "atSegmentEnd") {
                pending = index;
                return [];
            }
            const cut = cutOnSwitch ? silence() : [];
            return [...cut, ...enter(index, "now")].map(action => ({ offset: 0, action }));
        },

        /**
         * Advances by a window of samples, returning everything due inside it.
         *
         * @param {number} windowSamples how many samples the caller is about to render
         * @returns {Scheduled[]} actions with their offset inside that window
         */
        advance: windowSamples => {
            if (stopped || !timeline) return [];
            /** @type {Scheduled[]} */
            const scheduled = [];
            let consumed = 0;
            let boundaries = 0;

            while (consumed < windowSamples && !stopped) {
                const action = timeline.actions[cursor];
                const remaining = windowSamples - consumed;

                // Nothing due inside this window: run the clock to its end.
                if (!action || action.sample >= position + remaining) {
                    position += remaining;
                    consumed = windowSamples;
                    break;
                }

                consumed += Math.max(0, action.sample - position);
                position = action.sample;
                cursor += 1;

                if (action.type !== "segmentEnded") {
                    track(action);
                    scheduled.push({ offset: consumed, action });
                    continue;
                }

                boundaries += 1;
                for (const entry of handleSegmentEnd()) scheduled.push({ offset: consumed, action: entry });
                if (boundaries >= MAX_BOUNDARIES_PER_WINDOW) {
                    for (const entry of stop("too many segment boundaries in one window")) {
                        scheduled.push({ offset: consumed, action: entry });
                    }
                }
            }

            return scheduled;
        },

        /** @returns {LogEntry[]} every decision so far */
        log: () => [...log],

        /** @returns {object} what the transport is doing right now */
        state: () => ({ sequence: current, sample: position, tick: tickOf(position), stopped, pending })
    };
};
