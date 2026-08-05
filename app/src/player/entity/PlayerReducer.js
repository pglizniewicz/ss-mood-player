import { createReducer } from "@reduxjs/toolkit";
import {
    bankProgressAction,
    bankReadyAction,
    engineStateChangedAction,
    logAppendedAction,
    playbackStartedAction,
    positionChangedAction,
    repeatToggledAction
} from "../control/engine.js";
import {
    fileFailedAction,
    fileLoadedAction,
    sequenceSelectedAction,
    stubsToggledAction,
    switchWhenChangedAction
} from "../control/sequences.js";

/** The debug panel shows recent decisions, not the whole session. */
const LOG_LIMIT = 40;

/**
 * @typedef {"idle" | "starting" | "ready" | "failed"} EngineState
 *
 * @typedef {object} PlayerState
 * @property {EngineState} engine state of the audio engine
 * @property {string} engineMessage human readable detail for `failed`, empty otherwise
 * @property {number} bankLoaded bytes of the sound bank fetched so far
 * @property {number} bankTotal bytes the sound bank is expected to have
 * @property {number} bankPresets presets the loaded bank offers, 0 until it is loaded
 * @property {string} fileName name of the loaded XMI file, empty when none
 * @property {number} fileSize size of the loaded XMI file in bytes
 * @property {string} fileError why the last file could not be parsed, empty otherwise
 * @property {number} declaredSequenceCount sequence count claimed by the INFO chunk
 * @property {import("../control/sequences.js").SequenceSummary[]} summaries one per sequence
 * @property {number} selectedSequence position of the sequence in focus
 * @property {boolean} showStubs whether sequences without a single note are listed
 * @property {boolean} isPlaying whether the audio thread is sounding
 * @property {number} playingSequence the segment currently sounding
 * @property {number} positionTick where playback is inside that segment
 * @property {boolean} repeatSegment whether a segment repeats at its loop boundary
 * @property {"atSegmentEnd" | "now"} switchWhen when a variant change takes effect
 * @property {import("../control/transport.js").LogEntry[]} log recent transport decisions
 */

/** @type {PlayerState} */
const initialState = {
    engine: "idle",
    engineMessage: "",
    bankLoaded: 0,
    bankTotal: 0,
    bankPresets: 0,
    fileName: "",
    fileSize: 0,
    fileError: "",
    declaredSequenceCount: 0,
    summaries: [],
    selectedSequence: 0,
    showStubs: false,
    isPlaying: false,
    playingSequence: -1,
    positionTick: 0,
    repeatSegment: true,
    switchWhen: "atSegmentEnd",
    log: []
};

export const player = createReducer(initialState, builder => {
    builder.addCase(engineStateChangedAction, (state, { payload: { engine, message } }) => {
        state.engine = engine;
        state.engineMessage = message ?? "";
    }).addCase(bankProgressAction, (state, { payload: { loaded, total } }) => {
        state.bankLoaded = loaded;
        state.bankTotal = total;
    }).addCase(bankReadyAction, (state, { payload: { presets } }) => {
        state.bankPresets = presets;
    }).addCase(playbackStartedAction, (state, { payload: { index } }) => {
        state.isPlaying = true;
        state.playingSequence = index;
    }).addCase(positionChangedAction, (state, { payload: { sequence, tick, stopped } }) => {
        state.playingSequence = sequence;
        state.positionTick = tick;
        state.isPlaying = !stopped;
    }).addCase(logAppendedAction, (state, { payload: { entries } }) => {
        state.log = [...state.log, ...entries].slice(-LOG_LIMIT);
    }).addCase(repeatToggledAction, (state, { payload }) => {
        state.repeatSegment = payload;
    }).addCase(fileLoadedAction, (state, { payload: { name, size, declaredSequenceCount, summaries } }) => {
        state.fileName = name;
        state.fileSize = size;
        state.fileError = "";
        state.declaredSequenceCount = declaredSequenceCount;
        state.summaries = summaries;
        state.selectedSequence = summaries.find(summary => summary.isPlayable)?.index ?? 0;
        state.log = [];
    }).addCase(fileFailedAction, (state, { payload: { name, message } }) => {
        state.fileName = name;
        state.fileSize = 0;
        state.fileError = message;
        state.summaries = [];
        state.declaredSequenceCount = 0;
    }).addCase(sequenceSelectedAction, (state, { payload }) => {
        state.selectedSequence = payload;
    }).addCase(stubsToggledAction, (state, { payload }) => {
        state.showStubs = payload;
    }).addCase(switchWhenChangedAction, (state, { payload }) => {
        state.switchWhen = payload;
    });
});
