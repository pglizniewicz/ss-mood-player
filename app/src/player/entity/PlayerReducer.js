import { createReducer } from "@reduxjs/toolkit";
import { engineStateChangedAction } from "../control/Transport.js";
import { fileFailedAction, fileLoadedAction, sequenceSelectedAction } from "../control/Sequences.js";

/**
 * @typedef {"idle" | "starting" | "ready" | "failed"} EngineState
 *
 * @typedef {object} PlayerState
 * @property {EngineState} engine state of the audio engine
 * @property {string} engineMessage human readable detail for `failed`, empty otherwise
 * @property {string} fileName name of the loaded XMI file, empty when none
 * @property {number} fileSize size of the loaded XMI file in bytes
 * @property {string} fileError why the last file could not be parsed, empty otherwise
 * @property {number} declaredSequenceCount sequence count claimed by the INFO chunk
 * @property {import("../control/Sequences.js").SequenceSummary[]} summaries one per sequence
 * @property {number} selectedSequence position of the sequence in focus
 */

/** @type {PlayerState} */
const initialState = {
    engine: "idle",
    engineMessage: "",
    fileName: "",
    fileSize: 0,
    fileError: "",
    declaredSequenceCount: 0,
    summaries: [],
    selectedSequence: 0
};

export const player = createReducer(initialState, builder => {
    builder.addCase(engineStateChangedAction, (state, { payload: { engine, message } }) => {
        state.engine = engine;
        state.engineMessage = message ?? "";
    }).addCase(fileLoadedAction, (state, { payload: { name, size, declaredSequenceCount, summaries } }) => {
        state.fileName = name;
        state.fileSize = size;
        state.fileError = "";
        state.declaredSequenceCount = declaredSequenceCount;
        state.summaries = summaries;
        state.selectedSequence = 0;
    }).addCase(fileFailedAction, (state, { payload: { name, message } }) => {
        state.fileName = name;
        state.fileSize = 0;
        state.fileError = message;
        state.summaries = [];
        state.declaredSequenceCount = 0;
    }).addCase(sequenceSelectedAction, (state, { payload }) => {
        state.selectedSequence = payload;
    });
});
