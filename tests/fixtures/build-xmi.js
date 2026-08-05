/**
 * Writes XMI files for tests, so the parser can be exercised without shipping copyrighted
 * game data. Only what the tests need is supported.
 *
 * @typedef {object} FixtureEvent
 * @property {number} [delta] ticks since the previous event, 0 by default
 * @property {"noteOn" | "controller" | "programChange" | "pitchWheel" | "branch" | "tempo"
 *   | "loopStart" | "loopEnd" | "marker" | "trackName"} type
 * @property {number} [channel]
 * @property {number} [note]
 * @property {number} [velocity]
 * @property {number} [duration] note length in ticks
 * @property {number} [controller]
 * @property {number} [value]
 * @property {number} [program]
 * @property {number} [index] branch index
 * @property {string} [text] marker or track name text
 *
 * @typedef {object} FixtureSequence
 * @property {FixtureEvent[]} events
 * @property {[number, number]} [timeSignature] numerator and denominator, 4/4 by default
 * @property {number} [tempo] microseconds per quarter note, omitted from the file when absent
 * @property {{patch: number, bank: number}[]} [timbres]
 * @property {boolean} [omitBranchTable] emit controller 120 marks but no RBRN chunk
 */

const SEQUENCE_BRANCH_INDEX = 120;
const FOR_LOOP = 116;
const NEXT_BREAK = 117;

/**
 * XMI delta times are a run of bytes with the high bit clear which the sequencer sums,
 * so a long gap becomes several 0x7f bytes rather than a variable-length quantity.
 *
 * @param {number} delta ticks
 * @returns {number[]} the interval bytes
 */
const encodeInterval = delta => {
    const bytes = [];
    let remaining = delta;
    while (remaining > 0x7f) {
        bytes.push(0x7f);
        remaining -= 0x7f;
    }
    bytes.push(remaining);
    return bytes;
};

/**
 * @param {number} value the quantity
 * @returns {number[]} standard MIDI variable-length encoding
 */
const encodeVariableLength = value => {
    const bytes = [value & 0x7f];
    let remaining = value >>> 7;
    while (remaining > 0) {
        bytes.unshift((remaining & 0x7f) | 0x80);
        remaining >>>= 7;
    }
    return bytes;
};

/**
 * @param {number} microseconds per quarter note
 * @returns {number[]} the three big-endian bytes of a tempo meta event
 */
const tempoBytes = microseconds => [
    (microseconds >>> 16) & 0xff,
    (microseconds >>> 8) & 0xff,
    microseconds & 0xff
];

/**
 * @param {FixtureEvent} event the event to encode
 * @returns {number[]} status byte and payload
 */
const encodeEvent = event => {
    const channel = event.channel ?? 0;
    if (event.type === "noteOn") {
        return [
            0x90 | channel,
            event.note ?? 60,
            event.velocity ?? 100,
            ...encodeVariableLength(event.duration ?? 60)
        ];
    }
    if (event.type === "controller") return [0xb0 | channel, event.controller ?? 7, event.value ?? 100];
    if (event.type === "branch") return [0xb0 | channel, SEQUENCE_BRANCH_INDEX, event.index ?? 0];
    if (event.type === "loopStart") return [0xb0 | channel, FOR_LOOP, event.value ?? 0];
    // A value of 127 means "loop back"; anything below 64 breaks out.
    if (event.type === "loopEnd") return [0xb0 | channel, NEXT_BREAK, event.value ?? 127];
    if (event.type === "programChange") return [0xc0 | channel, event.program ?? 0];
    if (event.type === "pitchWheel") return [0xe0 | channel, 0x00, event.value ?? 0x40];
    if (event.type === "tempo") return [0xff, 0x51, 0x03, ...tempoBytes(event.value ?? 500_000)];
    if (event.type === "marker" || event.type === "trackName") {
        const text = [...(event.text ?? "")].map(character => character.charCodeAt(0));
        return [0xff, event.type === "marker" ? 0x06 : 0x03, text.length, ...text];
    }
    throw new Error(`unsupported fixture event type ${event.type}`);
};

/**
 * @param {string} id four character chunk identifier
 * @param {number[]} body chunk payload
 * @returns {number[]} the chunk, padded to an even length
 */
const chunk = (id, body) => {
    const size = body.length;
    const header = [...id].map(character => character.charCodeAt(0));
    const length = [(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff];
    return [...header, ...length, ...body, ...(size % 2 === 1 ? [0] : [])];
};

/**
 * @param {number} value the number to encode
 * @returns {number[]} two little-endian bytes
 */
const uint16LE = value => [value & 0xff, (value >>> 8) & 0xff];

/**
 * @param {number} value the number to encode
 * @returns {number[]} four little-endian bytes
 */
const uint32LE = value => [...uint16LE(value & 0xffff), ...uint16LE((value >>> 16) & 0xffff)];

/**
 * @param {FixtureSequence} sequence the sequence to encode
 * @returns {{body: number[], branches: {index: number, offset: number}[]}} EVNT body and the
 *   byte offsets of its branch marks, relative to the body
 */
const encodeEvents = ({ events, timeSignature = [4, 4], tempo }) => {
    const [numerator, denominator] = timeSignature;
    const body = [
        0x00,
        0xff,
        0x58,
        0x04,
        numerator,
        Math.log2(denominator),
        24,
        8,
        ...(tempo === undefined ? [] : [0x00, 0xff, 0x51, 0x03, ...tempoBytes(tempo)])
    ];
    /** @type {{index: number, offset: number}[]} */
    const branches = [];

    for (const event of events) {
        body.push(...encodeInterval(event.delta ?? 0));
        if (event.type === "branch") branches.push({ index: event.index ?? 0, offset: body.length });
        body.push(...encodeEvent(event));
    }

    body.push(0x00, 0xff, 0x2f, 0x00);
    return { body, branches };
};

/**
 * @param {FixtureSequence[]} sequences the sequences to write
 * @param {{omitDirectory?: boolean}} [options] `omitDirectory` writes a bare FORM/XMID file
 *   without the XDIR and CAT wrapper, the way some single-sequence files are stored
 * @returns {ArrayBuffer} a complete XMI file
 */
export const buildXmi = (sequences, options = {}) => {
    const forms = sequences.flatMap(sequence => {
        const { body, branches } = encodeEvents(sequence);
        const timbres = sequence.timbres ?? [];
        const timb = timbres.length > 0
            ? chunk("TIMB", [...uint16LE(timbres.length), ...timbres.flatMap(({ patch, bank }) => [patch, bank])])
            : [];
        const rbrn = branches.length > 0 && !sequence.omitBranchTable
            ? chunk("RBRN", [
                ...uint16LE(branches.length),
                ...branches.flatMap(({ index, offset }) => [...uint16LE(index), ...uint32LE(offset)])
            ])
            : [];
        return chunk("FORM", [...[..."XMID"].map(character => character.charCodeAt(0)), ...timb, ...rbrn, ...chunk("EVNT", body)]);
    });

    if (options.omitDirectory) return Uint8Array.from(forms).buffer;

    const directory = chunk("FORM", [
        ...[..."XDIR"].map(character => character.charCodeAt(0)),
        ...chunk("INFO", uint16LE(sequences.length))
    ]);
    const category = chunk("CAT ", [...[..."XMID"].map(character => character.charCodeAt(0)), ...forms]);

    return Uint8Array.from([...directory, ...category]).buffer;
};
