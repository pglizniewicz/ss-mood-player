/**
 * Reads the score tables that decide which musical module plays when. They are not in the XMI:
 * the game ships them beside it as `THMn.BIN` and `THMn.DAT`, and without them a player can only
 * pick modules by guesswork.
 *
 * The layout comes from Shockolate's `MacTune.c`, which reads the same bytes into these arrays:
 *
 *     track_table[NUM_SCORES][SUPERCHUNKS_PER_SCORE]
 *     transition_table[NUM_TRANSITIONS]
 *     layering_table[NUM_LAYERS][MAX_KEYS]
 *     key_table[NUM_LAYERABLE_SUPERCHUNKS][KEY_BAR_RESOLUTION]
 *
 * With the constants from `mlimbs.h` that comes to exactly 405 bytes, the size of THM1.BIN.
 * The Mac build appends two timing longs after the tables; the DOS file stops at the tables.
 *
 * A superchunk is played by XMI sequence `superchunk + 1` — `musicai.c` computes its track as
 * `1 + piece_ID`. That mapping is confirmed independently: `key_table` records the musical key of
 * each superchunk, and it agrees with the key measured from the notes of the corresponding
 * sequence (key 1 where the sequence sits on A, 4 on D, 5 on E, 0 where it holds no note).
 *
 * @typedef {object} Chunk
 * @property {number} superchunk its index
 * @property {number} bars how long it is
 * @property {number[]} channels the MIDI channels it drives
 * @property {number} channelMask the raw mask, bit `i` meaning channel `8 + i`
 *
 * @typedef {object} Score
 * @property {number} index which intensity level this is
 * @property {number[]} superchunks the four superchunks it cycles through
 *
 * @typedef {object} ScoreTables
 * @property {Score[]} scores intensity levels that hold anything
 * @property {number[]} transitions transition superchunks, 255 where unused
 * @property {Map<number, number[]>} layering layer number to a superchunk per key
 * @property {Map<number, number[]>} keys superchunk to its key per bar half
 * @property {Map<number, Chunk>} chunks superchunk to its shape, from the DAT file
 */

const NUM_SCORES = 8;
const SUPERCHUNKS_PER_SCORE = 4;
const NUM_TRANSITIONS = 9;
const NUM_LAYERS = 32;
const MAX_KEYS = 10;
const NUM_LAYERABLE_SUPERCHUNKS = 22;
const KEY_BAR_RESOLUTION = 2;

const TABLE_BYTES =
    NUM_SCORES * SUPERCHUNKS_PER_SCORE +
    NUM_TRANSITIONS +
    NUM_LAYERS * MAX_KEYS +
    NUM_LAYERABLE_SUPERCHUNKS * KEY_BAR_RESOLUTION;

const CHUNK_RECORD_BYTES = 16;
const CHUNK_RECORDS = 49;
const DAT_HEADER_BYTES = 2;
const DAT_BYTES = DAT_HEADER_BYTES + CHUNK_RECORDS * CHUNK_RECORD_BYTES;

/** Both files use 255 for "nothing here". */
export const EMPTY = 255;

/** The first MIDI channel a channel-mask bit refers to. */
const FIRST_CHANNEL = 8;

/** Offsets of the fields decoded from a DAT record. */
const CHANNEL_MASK = 3;
const BARS = 4;

/**
 * @param {number} superchunk a superchunk number
 * @returns {number} the XMI sequence that plays it
 */
export const sequenceIndexOf = superchunk => superchunk + 1;

/**
 * @param {Uint8Array} bin the THMn.BIN bytes
 * @param {Uint8Array} [dat] the THMn.DAT bytes, which describe each superchunk's shape
 * @returns {ScoreTables} the tables
 */
export const parseScore = (bin, dat) => {
    if (bin.length < TABLE_BYTES) {
        throw new Error(`score tables need ${TABLE_BYTES} bytes, got ${bin.length}`);
    }

    let at = 0;
    const take = count => [...bin.slice(at, (at += count))];

    const trackTable = Array.from({ length: NUM_SCORES }, () => take(SUPERCHUNKS_PER_SCORE));
    const transitions = take(NUM_TRANSITIONS);
    const layerRows = Array.from({ length: NUM_LAYERS }, () => take(MAX_KEYS));
    const keyRows = Array.from({ length: NUM_LAYERABLE_SUPERCHUNKS }, () => take(KEY_BAR_RESOLUTION));

    return {
        scores: trackTable
            .map((superchunks, index) => ({ index, superchunks }))
            .filter(({ superchunks }) => superchunks.some(value => value !== EMPTY)),
        transitions,
        layering: new Map(layerRows
            .map((byKey, layer) => /** @type {[number, number[]]} */ ([layer, byKey]))
            .filter(([, byKey]) => byKey.some(value => value !== EMPTY))),
        keys: new Map(keyRows.map((bars, superchunk) => [superchunk, bars])),
        chunks: dat ? parseChunks(dat) : new Map()
    };
};

/**
 * @param {Uint8Array} dat the THMn.DAT bytes
 * @returns {Map<number, Chunk>} one entry per superchunk that declares any channel
 */
const parseChunks = dat => {
    if (dat.length < DAT_BYTES) throw new Error(`chunk table needs ${DAT_BYTES} bytes, got ${dat.length}`);

    /** @type {Map<number, Chunk>} */
    const chunks = new Map();
    for (let superchunk = 0; superchunk < CHUNK_RECORDS; superchunk += 1) {
        const record = dat.subarray(
            DAT_HEADER_BYTES + superchunk * CHUNK_RECORD_BYTES,
            DAT_HEADER_BYTES + (superchunk + 1) * CHUNK_RECORD_BYTES
        );
        const channelMask = record[CHANNEL_MASK];
        if (channelMask === 0) continue;
        chunks.set(superchunk, {
            superchunk,
            bars: record[BARS],
            channelMask,
            channels: Array.from({ length: 8 }, (_, bit) => bit)
                .filter(bit => (channelMask & (1 << bit)) !== 0)
                .map(bit => FIRST_CHANNEL + bit)
        });
    }
    return chunks;
};

/**
 * The key a superchunk is in. Layers must match it, which is how the game changes variant without
 * changing key.
 *
 * @param {ScoreTables} tables the score tables
 * @param {number} superchunk which superchunk
 * @param {number} [bar] which half of it
 * @returns {number} the key, 0 meaning the superchunk holds no pitched material
 */
export const keyOf = (tables, superchunk, bar = 0) =>
    tables.keys.get(superchunk)?.[Math.min(bar, KEY_BAR_RESOLUTION - 1)] ?? 0;

/**
 * @param {ScoreTables} tables the score tables
 * @param {number} key the key to match
 * @returns {{layer: number, superchunk: number}[]} layers that can play over it
 */
export const layersForKey = (tables, key) =>
    [...tables.layering]
        .map(([layer, byKey]) => ({ layer, superchunk: byKey[key] ?? EMPTY }))
        .filter(({ superchunk }) => superchunk !== EMPTY);
