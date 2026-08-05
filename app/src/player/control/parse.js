import { readEvents } from "./events.js";
import { branchesFromEvents, readBranches, resolveBranches, FOR_LOOP, NEXT_BREAK } from "./branches.js";

/**
 * Parses an XMI (XMIDI) file into its sequences.
 *
 * Layout: `FORM`/`XDIR` with an `INFO` chunk stating the sequence count, then `CAT `/`XMID`
 * holding one `FORM`/`XMID` per sequence, each with optional `TIMB` and `RBRN` chunks and a
 * mandatory `EVNT` chunk. Chunk sizes are big-endian, payload fields little-endian. Files
 * without the directory wrapper are a single bare `FORM`/`XMID`.
 *
 * @typedef {object} Loop
 * @property {number} startTick where the FOR_LOOP controller sits
 * @property {number} endTick where the NEXT_BREAK controller sits
 * @property {number} ticks the loop's length, which is the sequence's musical length
 * @property {number} repeats the loop count from the controller, 0 meaning endless
 *
 * @typedef {object} XmiSequence
 * @property {number} index position of the sequence in the file
 * @property {import("./events.js").XmiEvent[]} events the event stream
 * @property {import("./branches.js").BranchPoint[]} branches resolved branch points
 * @property {{patch: number, bank: number}[]} timbres patches the sequence asks for
 * @property {number} durationTicks last tick in the stream
 * @property {{numerator: number, denominator: number}} timeSignature first one found, 4/4 by default
 * @property {number} tempoMicroseconds per quarter note; sets the tick-to-bar ratio, not the speed
 * @property {import("./events.js").Label[]} labels text, track name and marker events
 * @property {string} name the first label's text, empty when the sequence carries none
 * @property {Loop} [loop] the XMIDI loop, when the sequence declares one
 * @property {boolean} isPlayable whether the sequence contains any note at all
 * @property {number[]} channels MIDI channels the sequence actually uses, ascending
 *
 * @typedef {object} XmiFile
 * @property {XmiSequence[]} sequences
 * @property {number} declaredSequenceCount what INFO claims, 0 when there is no XDIR
 */

const CHUNK_HEADER_SIZE = 8;
const FORM_TYPE_SIZE = 4;
const TICKS_PER_SECOND = 120;
const MICROSECONDS_PER_SECOND = 1_000_000;
const DEFAULT_TIME_SIGNATURE = { numerator: 4, denominator: 4 };

/** What the AIL-era players assume when a file declares no tempo: 120 BPM. */
const DEFAULT_TEMPO_MICROSECONDS = 500_000;

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

    const { events, durationTicks, meta } = readEvents(view, evnt.start, evnt.end);
    const rbrn = chunk(chunks, "RBRN");
    const declared = rbrn ? readBranches(view, rbrn.start, rbrn.end) : [];
    const branches = declared.length > 0
        ? resolveBranches(declared, events, evnt.start)
        : branchesFromEvents(events);
    const timb = chunk(chunks, "TIMB");

    return {
        index,
        events,
        branches,
        timbres: timb ? readTimbres(view, timb) : [],
        durationTicks,
        timeSignature: meta.timeSignature ?? DEFAULT_TIME_SIGNATURE,
        tempoMicroseconds: meta.tempoMicroseconds ?? DEFAULT_TEMPO_MICROSECONDS,
        labels: meta.labels,
        name: meta.labels[0]?.text ?? "",
        loop: loopOf(events),
        isPlayable: events.some(event => event.type === "noteOn"),
        channels: [...new Set(events.map(event => event.channel).filter(channel => channel !== undefined))]
            .toSorted((left, right) => left - right)
    };
};

/**
 * The XMIDI loop spans the sequence's musical length: `FOR_LOOP` opens it and `NEXT_BREAK`
 * closes it. The span is read, but never executed as an endless loop — System Shock's music
 * engine relies on a sequence *ending* so it can queue the next one.
 *
 * @param {import("./events.js").XmiEvent[]} events the event stream
 * @returns {Loop | undefined} the loop, when the sequence declares one
 */
const loopOf = events => {
    const isController = number => event => event.type === "controller" && event.data1 === number;
    const start = events.find(isController(FOR_LOOP));
    const end = events.findLast(isController(NEXT_BREAK));
    if (!start || !end || end.tick <= start.tick) return undefined;
    return {
        startTick: start.tick,
        endTick: end.tick,
        ticks: end.tick - start.tick,
        repeats: start.data2 ?? 0
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
 * Ticks per quarter note follow from the tempo, not from a fixed PPQN: the sequencer clock is
 * always 120 Hz, so a 130 BPM sequence puts 55.4 ticks in a quarter, not 60. Getting this wrong
 * misplaces every bar line.
 *
 * @param {XmiSequence} sequence the sequence to measure
 * @returns {number} ticks in one quarter note
 */
export const ticksPerQuarter = ({ tempoMicroseconds }) =>
    (TICKS_PER_SECOND * tempoMicroseconds) / MICROSECONDS_PER_SECOND;

/**
 * @param {XmiSequence} sequence the sequence to measure
 * @returns {number} ticks in one bar of the sequence's time signature
 */
export const ticksPerBar = sequence =>
    (sequence.timeSignature.numerator * ticksPerQuarter(sequence) * 4) / sequence.timeSignature.denominator;

/**
 * @param {XmiSequence} sequence the sequence to measure
 * @returns {number} the loop's length in bars, 0 when it declares no loop
 */
export const loopBars = sequence => (sequence.loop ? sequence.loop.ticks / ticksPerBar(sequence) : 0);

/**
 * @param {number} ticks a tick count
 * @returns {number} the same position in seconds
 */
export const ticksToSeconds = ticks => ticks / TICKS_PER_SECOND;
