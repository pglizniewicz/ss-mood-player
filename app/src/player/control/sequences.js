import { createAction } from "@reduxjs/toolkit";
import store from "../../store.js";
import { loopBars, parseXmi, ticksToSeconds } from "./parse.js";

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
export const sequenceSelectedAction = createAction("sequenceSelectedAction");
export const stubsToggledAction = createAction("stubsToggledAction");
export const switchWhenChangedAction = createAction("switchWhenChangedAction");

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
 * @param {"atSegmentEnd" | "now"} when a variant change should take effect
 * @returns {void}
 */
export const changeSwitchWhen = when => {
    store.dispatch(switchWhenChangedAction(when));
};
