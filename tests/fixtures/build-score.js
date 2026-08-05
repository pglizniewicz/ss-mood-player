/**
 * Writes score tables for tests, so the score path can be exercised without game data.
 * The layout matches what Shockolate's `MacTune.c` reads: see `control/score.js`.
 */

const NUM_SCORES = 8;
const SUPERCHUNKS_PER_SCORE = 4;
const NUM_TRANSITIONS = 9;
const NUM_LAYERS = 32;
const MAX_KEYS = 10;
const NUM_LAYERABLE_SUPERCHUNKS = 22;
const KEY_BAR_RESOLUTION = 2;

const EMPTY = 255;

/**
 * @param {object} [options] what the tables should say
 * @param {Record<number, number[]>} [options.scores] superchunks per intensity level
 * @param {Record<number, number[]>} [options.layering] a superchunk per key, per layer
 * @param {Record<number, number[]>} [options.keys] the key of each superchunk, per bar half
 * @param {number[]} [options.transitions] transition superchunks
 * @returns {Uint8Array} a THMn.BIN file
 */
export const buildScoreTables = ({ scores = { 0: [0, 1, 0, 1] }, layering = {}, keys = {}, transitions = [] } = {}) => {
    const bytes = [];

    for (let score = 0; score < NUM_SCORES; score += 1) {
        const row = scores[score] ?? [];
        for (let at = 0; at < SUPERCHUNKS_PER_SCORE; at += 1) bytes.push(row[at] ?? EMPTY);
    }
    for (let at = 0; at < NUM_TRANSITIONS; at += 1) bytes.push(transitions[at] ?? EMPTY);
    for (let layer = 0; layer < NUM_LAYERS; layer += 1) {
        const row = layering[layer] ?? [];
        for (let key = 0; key < MAX_KEYS; key += 1) bytes.push(row[key] ?? EMPTY);
    }
    for (let superchunk = 0; superchunk < NUM_LAYERABLE_SUPERCHUNKS; superchunk += 1) {
        const row = keys[superchunk] ?? [];
        for (let bar = 0; bar < KEY_BAR_RESOLUTION; bar += 1) bytes.push(row[bar] ?? 0);
    }

    return Uint8Array.from(bytes);
};

/**
 * @param {Record<number, {bars?: number, channels?: number[]}>} chunks what each superchunk holds
 * @returns {Uint8Array} a THMn.DAT file
 */
export const buildChunkTable = chunks => {
    const bytes = [49, 1];
    for (let superchunk = 0; superchunk < 49; superchunk += 1) {
        const record = new Array(16).fill(0);
        const chunk = chunks[superchunk];
        if (chunk) {
            record[3] = (chunk.channels ?? []).reduce((mask, channel) => mask | (1 << (channel - 8)), 0);
            record[4] = chunk.bars ?? 4;
        }
        bytes.push(...record);
    }
    return Uint8Array.from(bytes);
};
