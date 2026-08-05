import { createReducer } from "@reduxjs/toolkit";
import { engineStateChangedAction, fileSelectedAction } from "../control/Transport.js";

/**
 * @typedef {"idle" | "starting" | "ready" | "failed"} EngineState
 *
 * @typedef {object} PlayerState
 * @property {EngineState} engine state of the audio engine
 * @property {string} engineMessage human readable detail for `failed`, empty otherwise
 * @property {string} fileName name of the loaded XMI file, empty when none
 * @property {number} fileSize size of the loaded XMI file in bytes
 */

/** @type {PlayerState} */
const initialState = {
    engine: "idle",
    engineMessage: "",
    fileName: "",
    fileSize: 0
};

export const player = createReducer(initialState, builder => {
    builder.addCase(engineStateChangedAction, (state, { payload: { engine, message } }) => {
        state.engine = engine;
        state.engineMessage = message ?? "";
    }).addCase(fileSelectedAction, (state, { payload: { name, size } }) => {
        state.fileName = name;
        state.fileSize = size;
    });
});
