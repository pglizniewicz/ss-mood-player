import { createAction } from "@reduxjs/toolkit";
import store from "../../store.js";
import { loopBars, parseXmi, ticksToSeconds } from "./parse.js";
import { keyOf, parseScore, sequenceIndexOf } from "./score.js";

/**
 * Parsed sequences stay in module scope rather than in the store: every reducer clones its
 * slice with `structuredClone()`, and these event streams are large and indexed constantly.
 * The store keeps only the summaries the UI renders.
 *
 * @type {import("./parse.js").XmiSequence[]}
 */
let loaded = [];

export const fileLoadedAction = createAction("fileLoadedAction");
export const fileFailedAction = createAction("fileFailedAction");
export const scoreLoadedAction = createAction("scoreLoadedAction");
export const scoreFailedAction = createAction("scoreFailedAction");
export const sequenceSelectedAction = createAction("sequenceSelectedAction");
export const stubsToggledAction = createAction("stubsToggledAction");
export const switchWhenChangedAction = createAction("switchWhenChangedAction");
export const scoreSelectedAction = createAction("scoreSelectedAction");

/**
 * @returns {import("./parse.js").XmiSequence[]} the sequences of the loaded file
 */
export const sequences = () => loaded;

/**
 * @param {number} index position in the file
 * @returns {import("./parse.js").XmiSequence | undefined} the sequence at that position
 */
export const sequence = index => loaded[index];

/**
 * @typedef {object} SequenceSummary
 * @property {number} index
 * @property {string} name from a text, track name or marker event; empty when the file has none
 * @property {boolean} isPlayable false for the marker-only stubs real files are full of
 * @property {number} eventCount
 * @property {number} durationSeconds
 * @property {number} loopSeconds 0 when the sequence declares no loop
 * @property {number} loopBars musical length of the loop, a whole number in real files
 * @property {number[]} channels
 * @property {number[]} branchIndices
 * @property {number} numerator
 * @property {number} denominator
 * @property {number} tempoBpm
 */

/**
 * @param {import("./parse.js").XmiSequence} sequence the parsed sequence
 * @returns {SequenceSummary} the plain, cloneable projection kept in the store
 */
const summarize = sequence => ({
    index: sequence.index,
    name: sequence.name,
    isPlayable: sequence.isPlayable,
    eventCount: sequence.events.length,
    durationSeconds: ticksToSeconds(sequence.durationTicks),
    loopSeconds: sequence.loop ? ticksToSeconds(sequence.loop.ticks) : 0,
    loopBars: loopBars(sequence),
    channels: sequence.channels,
    branchIndices: sequence.branches.map(branch => branch.index),
    numerator: sequence.timeSignature.numerator,
    denominator: sequence.timeSignature.denominator,
    tempoBpm: 60_000_000 / sequence.tempoMicroseconds
});

/**
 * @param {string} name file name, for display only
 * @param {ArrayBuffer} buffer the file contents
 * @returns {void}
 */
export const loadFile = (name, buffer) => {
    try {
        const { sequences: parsed, declaredSequenceCount } = parseXmi(buffer);
        loaded = parsed;
        store.dispatch(fileLoadedAction({
            name,
            size: buffer.byteLength,
            declaredSequenceCount,
            summaries: parsed.map(summarize)
        }));
    } catch (cause) {
        loaded = [];
        store.dispatch(fileFailedAction({ name, message: cause.message }));
    }
};

/**
 * The score tables, which decide which module plays when. Kept beside the sequences rather than
 * in the store for the same reason: the UI needs a summary, not the tables themselves.
 *
 * @type {import("./score.js").ScoreTables | undefined}
 */
let tables;

/**
 * @returns {import("./score.js").ScoreTables | undefined} the loaded score tables
 */
export const scoreTables = () => tables;

/**
 * @param {number} score which intensity level
 * @returns {number[]} the sequence indices it cycles through, empty when unknown
 */
export const scoreCycle = score =>
    (tables?.scores.find(({ index }) => index === score)?.superchunks ?? []).map(sequenceIndexOf);

/**
 * @param {string} name file name, for display only
 * @param {ArrayBuffer} bin the THMn.BIN contents
 * @param {ArrayBuffer} [dat] the THMn.DAT contents
 * @returns {void}
 */
export const loadScore = (name, bin, dat) => {
    try {
        tables = parseScore(new Uint8Array(bin), dat ? new Uint8Array(dat) : undefined);
        store.dispatch(scoreLoadedAction({
            name,
            hasChunks: tables.chunks.size > 0,
            scores: tables.scores.map(({ index, superchunks }) => ({
                index,
                superchunks,
                sequences: superchunks.map(sequenceIndexOf),
                keys: superchunks.map(superchunk => keyOf(tables, superchunk))
            })),
            transitions: tables.transitions.filter(value => value !== 255),
            layerCount: tables.layering.size
        }));
    } catch (cause) {
        tables = undefined;
        store.dispatch(scoreFailedAction({ name, message: cause.message }));
    }
};

/**
 * @param {number} index position in the file
 * @returns {void}
 */
export const selectSequence = index => {
    store.dispatch(sequenceSelectedAction(index));
};

/**
 * @param {boolean} showStubs whether sequences without a single note are listed
 * @returns {void}
 */
export const toggleStubs = showStubs => {
    store.dispatch(stubsToggledAction(showStubs));
};

/**
 * @param {number} index which intensity level to play
 * @returns {void}
 */
export const selectScore = index => {
    store.dispatch(scoreSelectedAction(index));
};

/**
 * @param {"atSegmentEnd" | "now"} when a variant change should take effect
 * @returns {void}
 */
export const changeSwitchWhen = when => {
    store.dispatch(switchWhenChangedAction(when));
};
