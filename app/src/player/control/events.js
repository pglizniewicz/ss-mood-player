/**
 * Reads the MIDI-like event stream of an XMI `EVNT` chunk.
 *
 * Two things separate this from a MIDI track: delta times are a run of bytes with the high
 * bit clear which are summed (not a variable-length quantity), and a note-on carries the
 * note's duration in ticks instead of being paired with a note-off.
 *
 * @typedef {"noteOn" | "noteOff" | "polyPressure" | "controller" | "programChange"
 *   | "channelPressure" | "pitchWheel" | "sysEx" | "timeSignature" | "endOfTrack"} EventType
 *
 * @typedef {object} XmiEvent
 * @property {number} tick absolute tick, at 120 ticks per second
 * @property {number} offset byte offset of the event's status byte within the EVNT body
 * @property {EventType} type
 * @property {number} [channel] MIDI channel 0-15, absent on meta events
 * @property {number} [data1] note, controller number or program
 * @property {number} [data2] velocity or controller value
 * @property {number} [duration] note length in ticks, note-on only
 * @property {number} [numerator] time signature only
 * @property {number} [denominator] time signature only, as a note value (4 = quarter)
 */

const STATUS_MASK = 0xf0;
const CHANNEL_MASK = 0x0f;
const META = 0xff;
const SYSEX = 0xf0;
const SYSEX_END = 0xf7;
const META_END_OF_TRACK = 0x2f;
const META_TIME_SIGNATURE = 0x58;

const TWO_DATA_BYTES = new Map([
    [0x80, "noteOff"],
    [0xa0, "polyPressure"],
    [0xb0, "controller"],
    [0xe0, "pitchWheel"]
]);

const ONE_DATA_BYTE = new Map([
    [0xc0, "programChange"],
    [0xd0, "channelPressure"]
]);

/**
 * Reads a standard MIDI variable-length quantity — used for note durations and meta
 * lengths, but never for the delta times of an XMI stream.
 *
 * @param {DataView} view the file
 * @param {number} offset where the quantity starts
 * @returns {{value: number, offset: number}} the value and the offset after it
 */
export const readVariableLength = (view, offset) => {
    let value = 0;
    let cursor = offset;
    for (;;) {
        const byte = view.getUint8(cursor);
        cursor += 1;
        value = (value << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) return { value, offset: cursor };
    }
};

/**
 * @param {XmiEvent[]} events the parsed stream
 * @param {number} lastTick tick of the final event
 * @returns {number} the tick the music actually stops at, including the last note's tail
 */
const streamEnd = (events, lastTick) =>
    events.reduce((latest, { tick, duration = 0 }) => Math.max(latest, tick + duration), lastTick);

/**
 * @param {DataView} view the file
 * @param {number} start first byte of the EVNT body
 * @param {number} end one past its last byte
 * @returns {{events: XmiEvent[], durationTicks: number}} the event stream
 */
export const readEvents = (view, start, end) => {
    /** @type {XmiEvent[]} */
    const events = [];
    let offset = start;
    let tick = 0;

    while (offset < end) {
        let byte = view.getUint8(offset);
        while (byte < 0x80) {
            tick += byte;
            offset += 1;
            if (offset >= end) return { events, durationTicks: streamEnd(events, tick) };
            byte = view.getUint8(offset);
        }

        const statusOffset = offset;
        offset += 1;
        const parsed = readEvent(view, offset, byte, { tick, offset: statusOffset });
        offset = parsed.offset;
        if (parsed.event) events.push(parsed.event);
        if (parsed.event?.type === "endOfTrack") break;
    }

    return { events, durationTicks: streamEnd(events, tick) };
};

/**
 * @param {DataView} view the file
 * @param {number} offset first byte after the status byte
 * @param {number} status the status byte
 * @param {{tick: number, offset: number}} position absolute tick and status byte offset
 * @returns {{event: XmiEvent | undefined, offset: number}} the event and the offset after it
 */
const readEvent = (view, offset, status, position) => {
    if (status === META) return readMeta(view, offset, position);
    if (status === SYSEX || status === SYSEX_END) {
        const { value: length, offset: dataStart } = readVariableLength(view, offset);
        return { event: { ...position, type: "sysEx" }, offset: dataStart + length };
    }

    const kind = status & STATUS_MASK;
    const channel = status & CHANNEL_MASK;

    if (kind === 0x90) {
        const { value: duration, offset: after } = readVariableLength(view, offset + 2);
        const velocity = view.getUint8(offset + 1);
        return {
            event: {
                ...position,
                // A zero velocity means note-off even in XMI, where it carries a duration too.
                type: velocity === 0 ? "noteOff" : "noteOn",
                channel,
                data1: view.getUint8(offset),
                data2: velocity,
                // The AIL driver plays a zero-length note very briefly; one tick keeps the
                // note-off queue from stalling while staying audibly equivalent.
                duration: Math.max(duration, 1)
            },
            offset: after
        };
    }

    const twoBytes = TWO_DATA_BYTES.get(kind);
    if (twoBytes) {
        return {
            event: {
                ...position,
                type: /** @type {EventType} */ (twoBytes),
                channel,
                data1: view.getUint8(offset),
                data2: view.getUint8(offset + 1)
            },
            offset: offset + 2
        };
    }

    const oneByte = ONE_DATA_BYTE.get(kind);
    if (oneByte) {
        return {
            event: {
                ...position,
                type: /** @type {EventType} */ (oneByte),
                channel,
                data1: view.getUint8(offset)
            },
            offset: offset + 1
        };
    }

    throw new Error(`unsupported XMI status byte 0x${status.toString(16)} at offset ${position.offset}`);
};

/**
 * @param {DataView} view the file
 * @param {number} offset the meta type byte
 * @param {{tick: number, offset: number}} position absolute tick and status byte offset
 * @returns {{event: XmiEvent | undefined, offset: number}} the event and the offset after it
 */
const readMeta = (view, offset, position) => {
    const metaType = view.getUint8(offset);
    const { value: length, offset: dataStart } = readVariableLength(view, offset + 1);
    const after = dataStart + length;

    if (metaType === META_END_OF_TRACK) return { event: { ...position, type: "endOfTrack" }, offset: after };
    if (metaType === META_TIME_SIGNATURE) {
        return {
            event: {
                ...position,
                type: "timeSignature",
                numerator: view.getUint8(dataStart),
                denominator: 2 ** view.getUint8(dataStart + 1)
            },
            offset: after
        };
    }

    // Tempo meta events survive the conversion to XMI but are meaningless: the AIL
    // sequencer runs at a fixed rate, so everything else is skipped deliberately.
    return { event: undefined, offset: after };
};
