import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EMPTY, keyOf, layersForKey, parseScore, sequenceIndexOf } from "../../app/src/player/control/score.js";
import { parseXmi } from "../../app/src/player/control/parse.js";

const BIN = new URL("../../data/THM1.BIN", import.meta.url);
const DAT = new URL("../../data/THM1.DAT", import.meta.url);
const XMI = new URL("../../data/THM1.XMI", import.meta.url);

/**
 * @param {URL} path a file to read
 * @returns {Promise<Uint8Array | undefined>} its bytes, or undefined when absent
 */
const bytesOf = async path => {
    try {
        return new Uint8Array(await readFile(path));
    } catch {
        return undefined;
    }
};

test("rejects a file that is too short to hold the tables", () => {
    assert.throws(() => parseScore(new Uint8Array(100)), /score tables need 405 bytes, got 100/);
});

test("reads the score, transition, layering and key tables", async t => {
    const [bin, dat] = await Promise.all([bytesOf(BIN), bytesOf(DAT)]);
    if (!bin) return t.skip("data/THM1.BIN not present");

    const tables = parseScore(bin, dat);

    // Three of the eight intensity levels are unused in this theme.
    assert.deepEqual(tables.scores.map(({ index }) => index), [0, 1, 4, 5, 6]);
    assert.deepEqual(tables.scores[0].superchunks, [0, 1, 0, 1]);
    assert.deepEqual(tables.scores.find(({ index }) => index === 5)?.superchunks, [6, 4, 7, 5]);
    assert.deepEqual(tables.transitions.filter(value => value !== EMPTY), [18, 16, 17]);
    // Layers pick a superchunk by key, which is what keeps an overlay in tune with the base.
    assert.deepEqual(tables.layering.get(0), [36, 32, 37, 38, 39, EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]);
});

test("the key table agrees with the key measured from the sequences' notes", async t => {
    const [bin, xmi] = await Promise.all([bytesOf(BIN), bytesOf(XMI)]);
    if (!bin || !xmi) return t.skip("data/THM1.BIN or THM1.XMI not present");

    const tables = parseScore(bin);
    const { sequences } = parseXmi(xmi.buffer.slice(xmi.byteOffset, xmi.byteOffset + xmi.byteLength));

    /**
     * @param {number} index a sequence
     * @returns {number | undefined} the pitch class its lowest melodic channel sits on
     */
    const rootOf = index => {
        const melodic = sequences[index].events.filter(({ type, channel }) => type === "noteOn" && channel !== 9);
        if (melodic.length === 0) return undefined;
        const lowest = Math.min(...melodic.map(({ channel }) => channel ?? 0));
        const histogram = new Array(12).fill(0);
        for (const note of melodic.filter(({ channel }) => channel === lowest)) {
            histogram[(note.data1 ?? 0) % 12] += 1;
        }
        return histogram.indexOf(Math.max(...histogram));
    };

    // Pitch classes: 9 is A, 2 is D, 4 is E. The mapping was derived from the data, not assumed.
    const expected = new Map([[1, 9], [4, 2], [5, 4]]);
    const checked = [];
    for (let superchunk = 0; superchunk < 10; superchunk += 1) {
        const key = keyOf(tables, superchunk);
        const root = rootOf(sequenceIndexOf(superchunk));
        if (root === undefined) continue;
        assert.equal(root, expected.get(key), `superchunk ${superchunk} has key ${key} but its sequence sits on pitch class ${root}`);
        checked.push(superchunk);
    }
    assert.equal(checked.length, 10, "expected all ten base superchunks to carry pitched material");

    // Key 0 marks the superchunks whose sequences hold no note at all.
    assert.equal(keyOf(tables, 10), 0);
    assert.equal(rootOf(sequenceIndexOf(10)), undefined);
});

test("the chunk table's channels and bar counts match the sequences", async t => {
    const [bin, dat, xmi] = await Promise.all([bytesOf(BIN), bytesOf(DAT), bytesOf(XMI)]);
    if (!bin || !dat || !xmi) return t.skip("score tables or THM1.XMI not present");

    const tables = parseScore(bin, dat);
    const { sequences } = parseXmi(xmi.buffer.slice(xmi.byteOffset, xmi.byteOffset + xmi.byteLength));

    // The base modules a score cycles through: here the record's channel mask covers every
    // channel the sequence actually plays. Two chunks elsewhere in the file (18 and 47) use more
    // channels than they declare, so the mask is a reservation hint rather than a guarantee.
    for (const superchunk of new Set(tables.scores.flatMap(({ superchunks }) => superchunks))) {
        const chunk = tables.chunks.get(superchunk);
        const sequence = sequences[sequenceIndexOf(superchunk)];
        if (!chunk || !sequence?.isPlayable) continue;
        for (const channel of sequence.channels) {
            assert.ok(
                chunk.channels.includes(channel),
                `superchunk ${superchunk} plays channel ${channel} but its record declares ${chunk.channels}`
            );
        }
        assert.equal(chunk.bars, 4, `base superchunk ${superchunk} should be four bars`);
    }

    // Superchunk 16 is the ten-bar transition, and the overlay layers are two-bar single-channel
    // modules — which is what makes them stackable over a base.
    assert.equal(tables.chunks.get(16)?.bars, 10);
    for (const { superchunk } of layersForKey(tables, 1)) {
        const chunk = tables.chunks.get(superchunk);
        if (!chunk || chunk.channels.length !== 1) continue;
        assert.equal(chunk.bars, 2, `layer superchunk ${superchunk} should be two bars`);
    }
    assert.ok(layersForKey(tables, 1).length > 0);
});
