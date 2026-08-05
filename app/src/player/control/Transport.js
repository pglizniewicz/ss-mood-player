import { createAction } from "@reduxjs/toolkit";
import store from "../../store.js";

export const engineStateChangedAction = createAction("engineStateChangedAction");

/**
 * @param {"idle" | "starting" | "ready" | "failed"} engine new engine state
 * @param {string} [message] detail shown to the user when the engine failed
 * @returns {void}
 */
export const engineStateChanged = (engine, message) => {
    store.dispatch(engineStateChangedAction({ engine, message }));
};

export const fileSelectedAction = createAction("fileSelectedAction");

/**
 * @param {File} file the XMI file picked by the user
 * @returns {void}
 */
export const fileSelected = ({ name, size }) => {
    store.dispatch(fileSelectedAction({ name, size }));
};
