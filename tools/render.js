#!/usr/bin/env node
/**
 * Renders an XMI sequence to a WAV file and prints an RMS table.
 *
 * This is the debugging tool for the project: one command, no browser, and it drives exactly the
 * same timeline, dispatch and synthesizer code the audio worklet uses, so what it produces is
 * evidence about the real playback path.
 *
 * Usage:
 *   node tools/render.js data/THM1.XMI /tmp/out.wav --soundfont app/src/assets/gm.sf3
 *   node tools/render.js data/THM1.XMI /tmp/out.wav --sequence 9 --seconds 12 --repeat
 */

import { readFile, writeFile } from "node:fs/promises";
import { parseXmi, ticksToSeconds } from "../app/src/player/control/parse.js";
import { createTransport } from "../app/src/player/control/transport.js";
import { renderSegments, rmsWindows, BLOCK } from "../app/src/player/control/render.js";
import { parseScore, sequenceIndexOf } from "../app/src/player/control/score.js";
import {
    BasicSoundBank,
    SoundBankLoader,
    SpessaSynthProcessor,
    audioToWav
} from "../app/src/libs/spessasynth_core.js";

const DEFAULT_RATE = 48_000;
const DEFAULT_SOUNDFONT = "app/src/assets/GeneralUserGS.sf3";

/**
 * @param {string[]} argv the raw arguments
 * @returns {{xmi: string, wav: string, sequence?: number, seconds?: number, soundfont?: string, rate: number, repeat: boolean}} parsed options
 */
const parseArguments = argv => {
    const positional = argv.filter(argument => !argument.startsWith("--"));
    const flag = name => {
        const at = argv.indexOf(`--${name}`);
        return at === -1 ? undefined : argv[at + 1];
    };
    const [xmi, wav] = positional;
    if (!xmi || !wav) throw new Error("usage: render.js <file.xmi> <out.wav> [--sequence N] [--seconds S] [--soundfont path] [--rate Hz] [--repeat] [--channels 9,10] [--transpose 12:-1]");

    return {
        xmi,
        wav,
        sequence: flag("sequence") === undefined ? undefined : Number(flag("sequence")),
        seconds: flag("seconds") === undefined ? undefined : Number(flag("seconds")),
        soundfont: flag("soundfont") ?? process.env.SS_SOUNDFONT ?? DEFAULT_SOUNDFONT,
        rate: Number(flag("rate") ?? DEFAULT_RATE),
        repeat: argv.includes("--repeat"),
        channels: flag("channels") === undefined
            ? undefined
            : new Set(String(flag("channels")).split(",").map(Number)),
        then: flag("then") === undefined ? undefined : Number(flag("then")),
        score: flag("score") === undefined ? undefined : Number(flag("score")),
        transpose: flag("transpose") === undefined
            ? undefined
            : new Map(String(flag("transpose")).split(",").map(pair => {
                const [channel, semitones] = pair.split(":").map(Number);
                return [channel, semitones];
            }))
    };
};

/**
 * @param {string} path a file to read
 * @returns {Promise<ArrayBuffer>} its bytes, detached from Node's shared pool
 */
const bytesOf = async path => {
    const raw = await readFile(path);
    return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
};

/**
 * @param {{start: number, rms: number}[]} windows the measured envelope
 * @returns {void}
 */
const printEnvelope = windows => {
    const peak = Math.max(...windows.map(({ rms }) => rms), 1e-9);
    console.log("\n  time     rms     ");
    for (const { start, rms } of windows) {
        const bar = "#".repeat(Math.round((rms / peak) * 40));
        console.log(`  ${start.toFixed(1).padStart(5)}s  ${rms.toFixed(4)}  ${bar}`);
    }
    const silent = windows.filter(({ rms }) => rms < 1e-4).length;
    console.log(`\n  peak rms ${peak.toFixed(4)}, ${silent}/${windows.length} windows silent`);
};

/**
 * Builds the superchunk cycle of a score from the tables beside the XMI file.
 *
 * @param {{xmi: string, score: number}} options the file and the score wanted
 * @returns {Promise<{first: number, next: (current: number) => number}>} the cycle
 */
const scoreCycle = async ({ xmi, score }) => {
    const base = xmi.replace(/\.xmi$/i, "");
    const [bin, dat] = await Promise.all([
        readFile(`${base}.BIN`).catch(() => readFile(`${base}.bin`)),
        readFile(`${base}.DAT`).catch(() => readFile(`${base}.dat`).catch(() => undefined))
    ]);
    const tables = parseScore(new Uint8Array(bin), dat ? new Uint8Array(dat) : undefined);
    const wanted = tables.scores.find(({ index }) => index === score);
    if (!wanted) {
        throw new Error(`score ${score} is empty; this theme defines ${tables.scores.map(({ index }) => index)}`);
    }

    const order = wanted.superchunks.map(sequenceIndexOf);
    let at = 0;
    console.log(`  score ${score}: superchunks [${wanted.superchunks}] -> sequences [${order}]`);
    return {
        first: order[0],
        next: () => {
            at = (at + 1) % order.length;
            return order[at];
        }
    };
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));
    const { sequences } = parseXmi(await bytesOf(options.xmi));
    const chosen = options.sequence ?? sequences.find(({ isPlayable }) => isPlayable)?.index ?? 0;
    const sequence = sequences[chosen];
    if (!sequence) throw new Error(`no sequence ${chosen} in ${options.xmi}`);

    const synth = new SpessaSynthProcessor(options.rate, {
        eventsEnabled: false,
        // Reverb and chorus are the main source of drift between runs, and this is evidence.
        effectsEnabled: false,
        maxBufferSize: BLOCK,
        initialTime: 0
    });
    // Mandatory before the first note: an SF3 bank whose Vorbis decoder is not ready yet decodes
    // to silence and caches that silence permanently.
    await synth.processorInitialized;
    synth.setSystemParameter("autoAllocateVoices", true);
    synth.setSystemParameter("interpolationType", 2);

    const bankBytes = options.soundfont
        ? await bytesOf(options.soundfont)
        : BasicSoundBank.getSampleSoundBankFile();
    synth.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(bankBytes), "main");

    // A score is a cycle of superchunks; the game never plays one module on its own.
    const cycle = options.score === undefined ? undefined : await scoreCycle(options);
    const transport = createTransport({
        sampleRate: options.rate,
        sequenceAt: index => sequences[index],
        repeatSegment: options.repeat,
        nextSequence: cycle?.next
    });
    transport.start(cycle ? cycle.first : chosen);
    // Queue a second variant to hear the switch land on the loop boundary.
    if (options.then !== undefined) transport.requestSequence(options.then);

    const followUp = options.then === undefined
        ? 0
        : ticksToSeconds(sequences[options.then]?.loop?.ticks ?? sequences[options.then]?.durationTicks ?? 0);
    const seconds = options.seconds
        ?? ticksToSeconds(sequence.loop?.ticks ?? sequence.durationTicks) + followUp + 1;
    const totalSamples = Math.round(seconds * options.rate);
    const started = process.hrtime.bigint();
    const { left, right } = renderSegments({
        synth,
        transport,
        totalSamples,
        playsChannel: options.channels ? channel => options.channels.has(channel) : undefined,
        transposeBy: options.transpose ? channel => options.transpose.get(channel) ?? 0 : undefined
    });
    const elapsed = Number(process.hrtime.bigint() - started) / 1e9;

    // Normalisation is on by default and would rescale every render to its own peak, which
    // destroys the one thing an RMS comparison is for.
    await writeFile(options.wav, Buffer.from(audioToWav([left, right], options.rate, { normalizeAudio: false })));

    console.log(`${options.xmi} sequence ${chosen}${sequence.name ? ` "${sequence.name}"` : ""}`);
    console.log(`  bank: ${options.soundfont ?? "built-in sample bank (single saw wave)"}`);
    console.log(`  ${sequence.events.length} events, ${sequence.channels.length} channels [${sequence.channels}]${options.channels ? ` -> playing only [${[...options.channels]}]` : ""}${options.transpose ? ` -> transposed ${[...options.transpose].map(([c, t]) => `ch${c}:${t > 0 ? "+" : ""}${t}`).join(" ")}` : ""}`);
    console.log(`  loop ${sequence.loop ? `${sequence.loop.ticks} ticks` : "none"}, rendered ${seconds.toFixed(1)}s at ${options.rate} Hz`);
    console.log(`  ${options.wav} written in ${elapsed.toFixed(2)}s (${(seconds / elapsed).toFixed(1)}x realtime)`);
    printEnvelope(rmsWindows(left, right, options.rate));
    console.log("\n  transport log:");
    for (const entry of transport.log()) {
        console.log(`    tick ${String(entry.tick).padStart(5)}  ${entry.kind}${entry.sequence === undefined ? "" : ` seq=${entry.sequence}`}${entry.reason ? ` (${entry.reason})` : ""}`);
    }
};

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});
