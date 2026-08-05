#!/usr/bin/env node
/**
 * Exports an XMI sequence as a standard MIDI file, so the note data can be checked in any other
 * player or DAW instead of only through this project's synthesizer.
 *
 * Usage:
 *   node tools/export-midi.js data/THM1.XMI /tmp/seq9.mid --sequence 9
 */

import { readFile, writeFile } from "node:fs/promises";
import { parseXmi, ticksPerQuarter, ticksToSeconds } from "../app/src/player/control/parse.js";
import { toMidi } from "./midi.js";

const main = async () => {
    const argv = process.argv.slice(2);
    const [xmi, out] = argv.filter(argument => !argument.startsWith("--"));
    if (!xmi || !out) throw new Error("usage: export-midi.js <file.xmi> <out.mid> [--sequence N]");
    const at = argv.indexOf("--sequence");
    const wanted = at === -1 ? undefined : Number(argv[at + 1]);

    const raw = await readFile(xmi);
    const { sequences } = parseXmi(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const chosen = wanted ?? sequences.find(({ isPlayable }) => isPlayable)?.index ?? 0;
    const sequence = sequences[chosen];
    if (!sequence) throw new Error(`no sequence ${chosen} in ${xmi}`);

    const midi = toMidi(sequence);
    await writeFile(out, midi);

    const notes = sequence.events.filter(({ type }) => type === "noteOn");
    console.log(`${xmi} sequence ${chosen}${sequence.name ? ` "${sequence.name}"` : ""} -> ${out} (${midi.length} bytes)`);
    console.log(`  ${notes.length} notes on channels [${sequence.channels}]`);
    console.log(`  ${sequence.timeSignature.numerator}/${sequence.timeSignature.denominator}, ${(60_000_000 / sequence.tempoMicroseconds).toFixed(1)} BPM, ${ticksPerQuarter(sequence).toFixed(2)} XMI ticks per quarter`);
    console.log(`  loop ${sequence.loop ? `${sequence.loop.ticks} ticks = ${ticksToSeconds(sequence.loop.ticks).toFixed(2)}s` : "none"}`);
};

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
