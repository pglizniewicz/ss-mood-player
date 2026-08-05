import { createAction } from "@reduxjs/toolkit";
import store from "../../store.js";
import { parseXmi, ticksToSeconds } from "./parse.js";

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
 * @property {number} eventCount
 * @property {number} durationSeconds
 * @property {number[]} channels
 * @property {number[]} branchIndices
 * @property {number} numerator
 * @property {number} denominator
 */

/**
 * @param {import("./parse.js").XmiSequence} sequence the parsed sequence
 * @returns {SequenceSummary} the plain, cloneable projection kept in the store
 */
const summarize = ({ index, events, branches, durationTicks, timeSignature, channels }) => ({
    index,
    eventCount: events.length,
    durationSeconds: ticksToSeconds(durationTicks),
    channels,
    branchIndices: branches.map(branch => branch.index),
    numerator: timeSignature.numerator,
    denominator: timeSignature.denominator
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
