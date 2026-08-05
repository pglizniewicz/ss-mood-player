import { readEvents } from "./events.js";
import { branchesFromEvents, readBranches, resolveBranches } from "./branches.js";

/**
 * Parses an XMI (XMIDI) file into its sequences.
 *
 * Layout: `FORM`/`XDIR` with an `INFO` chunk stating the sequence count, then `CAT `/`XMID`
 * holding one `FORM`/`XMID` per sequence, each with optional `TIMB` and `RBRN` chunks and a
 * mandatory `EVNT` chunk. Chunk sizes are big-endian, payload fields little-endian. Files
 * without the directory wrapper are a single bare `FORM`/`XMID`.
 *
 * @typedef {object} XmiSequence
 * @property {number} index position of the sequence in the file
 * @property {import("./events.js").XmiEvent[]} events the event stream
 * @property {import("./branches.js").BranchPoint[]} branches resolved branch points
 * @property {{patch: number, bank: number}[]} timbres patches the sequence asks for
 * @property {number} durationTicks last tick in the stream
 * @property {{numerator: number, denominator: number}} timeSignature first one found, 4/4 by default
 * @property {number[]} channels MIDI channels the sequence actually uses, ascending
 *
 * @typedef {object} XmiFile
 * @property {XmiSequence[]} sequences
 * @property {number} declaredSequenceCount what INFO claims, 0 when there is no XDIR
 */

const CHUNK_HEADER_SIZE = 8;
const FORM_TYPE_SIZE = 4;
const TICKS_PER_SECOND = 120;
const TICKS_PER_QUARTER = 60;
const DEFAULT_TIME_SIGNATURE = { numerator: 4, denominator: 4 };

/** Ticks per second of the AIL sequencer — PPQN 60 at 500 000 µs per quarter note. */
export const TICK_RATE = TICKS_PER_SECOND;

/**
 * @typedef {{id: string, start: number, end: number}} Chunk
 */

/**
 * @param {DataView} view the file
 * @param {number} offset first byte of the identifier
 * @returns {string} the four character chunk identifier
 */
const fourCC = (view, offset) =>
    String.fromCharCode(...[0, 1, 2, 3].map(byte => view.getUint8(offset + byte)));

/**
 * @param {DataView} view the file
 * @param {number} start where to begin reading chunks
 * @param {number} end one past the last readable byte
 * @returns {Chunk[]} the chunks in that region
 */
const readChunks = (view, start, end) => {
    /** @type {Chunk[]} */
    const chunks = [];
    let offset = start;

    while (offset + CHUNK_HEADER_SIZE <= end) {
        const id = fourCC(view, offset);
        const size = view.getUint32(offset + 4);
        const bodyStart = offset + CHUNK_HEADER_SIZE;
        if (bodyStart + size > end) break;
        chunks.push({ id, start: bodyStart, end: bodyStart + size });
        // IFF pads odd-sized chunks to an even boundary.
        offset = bodyStart + size + (size % 2);
    }

    return chunks;
};

/**
 * @param {Chunk[]} chunks chunks to search
 * @param {string} id chunk identifier
 * @returns {Chunk | undefined} the first chunk with that identifier
 */
const chunk = (chunks, id) => chunks.find(candidate => candidate.id === id);

/**
 * @param {DataView} view the file
 * @param {Chunk} container a FORM or CAT chunk
 * @returns {Chunk[]} the chunks nested inside it, past its form type
 */
const nested = (view, container) => readChunks(view, container.start + FORM_TYPE_SIZE, container.end);

/**
 * @param {DataView} view the file
 * @param {Chunk} timb the TIMB chunk
 * @returns {{patch: number, bank: number}[]} requested patches
 */
const readTimbres = (view, timb) => {
    const count = view.getUint16(timb.start, true);
    return Array.from({ length: count }, (_, entry) => ({
        patch: view.getUint8(timb.start + 2 + entry * 2),
        bank: view.getUint8(timb.start + 3 + entry * 2)
    }));
};

/**
 * @param {DataView} view the file
 * @param {Chunk} form a FORM/XMID chunk
 * @param {number} index position of the sequence in the file
 * @returns {XmiSequence} the parsed sequence
 */
const readSequence = (view, form, index) => {
    const chunks = nested(view, form);
    const evnt = chunk(chunks, "EVNT");
    if (!evnt) throw new Error(`sequence ${index} has no EVNT chunk`);

    const { events, durationTicks } = readEvents(view, evnt.start, evnt.end);
    const rbrn = chunk(chunks, "RBRN");
    const declared = rbrn ? readBranches(view, rbrn.start, rbrn.end) : [];
    const branches = declared.length > 0
        ? resolveBranches(declared, events, evnt.start)
        : branchesFromEvents(events);
    const timb = chunk(chunks, "TIMB");
    const signature = events.find(event => event.type === "timeSignature");

    return {
        index,
        events,
        branches,
        timbres: timb ? readTimbres(view, timb) : [],
        durationTicks,
        timeSignature: signature
            ? { numerator: signature.numerator ?? 4, denominator: signature.denominator ?? 4 }
            : DEFAULT_TIME_SIGNATURE,
        channels: [...new Set(events.map(event => event.channel).filter(channel => channel !== undefined))]
            .toSorted((left, right) => left - right)
    };
};

/**
 * @param {DataView} view the file
 * @returns {Chunk[]} every FORM/XMID chunk in the file, in order
 */
const sequenceForms = view => {
    const top = readChunks(view, 0, view.byteLength);
    const root = top[0];
    if (!root) throw new Error("not an XMI file: no IFF chunk found");

    const rootType = fourCC(view, root.start);
    if (root.id === "FORM" && rootType === "XMID") return [root];

    const category = top.find(candidate => candidate.id.trimEnd() === "CAT");
    if (!category) throw new Error("not an XMI file: neither FORM XMID nor CAT XMID found");
    return nested(view, category).filter(candidate => candidate.id === "FORM");
};

/**
 * @param {ArrayBuffer} buffer the file contents
 * @returns {XmiFile} the parsed file
 */
export const parseXmi = buffer => {
    const view = new DataView(buffer);
    const top = readChunks(view, 0, buffer.byteLength);
    const info = top
        .filter(candidate => candidate.id === "FORM")
        .flatMap(form => nested(view, form))
        .find(candidate => candidate.id === "INFO");

    return {
        sequences: sequenceForms(view).map((form, index) => readSequence(view, form, index)),
        declaredSequenceCount: info ? view.getUint16(info.start, true) : 0
    };
};

/**
 * @param {XmiSequence} sequence the sequence to measure
 * @returns {number} ticks in one bar of the sequence's time signature
 */
export const ticksPerBar = ({ timeSignature: { numerator, denominator } }) =>
    (numerator * TICKS_PER_QUARTER * 4) / denominator;

/**
 * @param {number} ticks a tick count
 * @returns {number} the same position in seconds
 */
export const ticksToSeconds = ticks => ticks / TICKS_PER_SECOND;
