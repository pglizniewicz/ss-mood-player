import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseXmi, loopBars } from "../../app/src/player/control/parse.js";
import { FOR_LOOP, NEXT_BREAK, SEQUENCE_BRANCH_INDEX } from "../../app/src/player/control/branches.js";

const FILE = new URL("../../data/THM1.XMI", import.meta.url);

/**
 * Asserts the parser against real System Shock data. Game files cannot be committed, so the
 * whole file is skipped when `data/THM1.XMI` is absent — CI runs on generated fixtures, while
 * anyone holding the game data gets the stronger check. The expected values were measured from
 * the file itself and are documented in the plan.
 *
 * @returns {Promise<ArrayBuffer | undefined>} the file, or undefined when it is not present
 */
const load = async () => {
    try {
        const raw = await readFile(FILE);
        return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    } catch {
        return undefined;
    }
};

test("THM1.XMI parses into the 50 sequences its directory declares", async t => {
    const buffer = await load();
    if (!buffer) return t.skip("data/THM1.XMI not present");

    const { sequences, declaredSequenceCount } = parseXmi(buffer);

    assert.equal(declaredSequenceCount, 50);
    assert.equal(sequences.length, 50);
    assert.equal(sequences.reduce((total, { events }) => total + events.length, 0), 8077);
    // 20 sequences hold no note at all — mostly "theme1 SCMIDIfile" markers.
    assert.equal(sequences.filter(({ isPlayable }) => isPlayable).length, 30);
    assert.equal(sequences.find(({ name }) => name === "keeper")?.index, 9);
});

test("THM1.XMI loops are whole bars, and it uses loop controllers rather than branch points", async t => {
    const buffer = await load();
    if (!buffer) return t.skip("data/THM1.XMI not present");

    const { sequences } = parseXmi(buffer);
    const looping = sequences.filter(({ loop }) => loop !== undefined);
    assert.equal(looping.length, 31);

    for (const sequence of looping) {
        const bars = loopBars(sequence);
        assert.ok(
            Math.abs(bars - Math.round(bars)) < 0.01,
            `sequence ${sequence.index} loops over ${bars.toFixed(3)} bars, which is not a whole number`
        );
    }
    assert.deepEqual(
        [...new Set(looping.map(sequence => Math.round(loopBars(sequence))))].toSorted((left, right) => left - right),
        [1, 2, 4, 10]
    );

    // Every sequence declares 130 BPM, which is what puts 55.38 ticks in a quarter note.
    assert.deepEqual([...new Set(sequences.map(({ tempoMicroseconds }) => tempoMicroseconds))], [461_538]);

    const controllers = sequences.flatMap(({ events }) =>
        events.filter(({ type }) => type === "controller").map(({ data1 }) => data1));
    assert.equal(controllers.filter(number => number === FOR_LOOP).length, 31);
    assert.equal(controllers.filter(number => number === NEXT_BREAK).length, 31);
    // The variant mechanism here is separate looping segments, not in-song jumps.
    assert.equal(controllers.filter(number => number === SEQUENCE_BRANCH_INDEX).length, 0);
    assert.equal(sequences.flatMap(({ branches }) => branches).length, 0);
});

test("THM1.XMI drives channel 9 as GM percussion and 10-13 melodically", async t => {
    const buffer = await load();
    if (!buffer) return t.skip("data/THM1.XMI not present");

    const events = parseXmi(buffer).sequences.flatMap(sequence => sequence.events);
    const drumNotes = events.filter(({ type, channel }) => type === "noteOn" && channel === 9);
    const drumPrograms = events.filter(({ type, channel }) => type === "programChange" && channel === 9);

    // A handful of pitches in the GM percussion key range and no program change: a drum part,
    // so a plain General MIDI sound bank maps this file correctly.
    assert.equal(drumPrograms.length, 0);
    assert.ok(new Set(drumNotes.map(({ data1 }) => data1)).size <= 12);
    assert.ok(drumNotes.every(({ data1 }) => data1 >= 35 && data1 <= 81));

    const melodic = new Set(events
        .filter(({ type }) => type === "programChange")
        .map(({ channel }) => channel));
    assert.deepEqual([...melodic].toSorted((left, right) => left - right), [10, 11, 12, 13]);
});
