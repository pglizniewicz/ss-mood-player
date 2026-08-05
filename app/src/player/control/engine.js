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

export const bankProgressAction = createAction("bankProgressAction");

/**
 * @param {number} loaded bytes fetched so far
 * @param {number} total bytes expected, 0 when the server does not say
 * @returns {void}
 */
export const bankProgress = (loaded, total) => {
    store.dispatch(bankProgressAction({ loaded, total }));
};

export const bankReadyAction = createAction("bankReadyAction");

/**
 * @param {number} presets how many presets the bank offers
 * @returns {void}
 */
export const bankReady = presets => {
    store.dispatch(bankReadyAction({ presets }));
};

export const playbackStartedAction = createAction("playbackStartedAction");

/**
 * @param {number} index the segment that started
 * @returns {void}
 */
export const playbackStarted = index => {
    store.dispatch(playbackStartedAction({ index }));
};

export const positionChangedAction = createAction("positionChangedAction");

/**
 * @param {{sequence: number, tick: number, stopped: boolean}} position where playback is
 * @returns {void}
 */
export const positionChanged = position => {
    store.dispatch(positionChangedAction(position));
};

export const logAppendedAction = createAction("logAppendedAction");

/**
 * @param {import("./transport.js").LogEntry[]} entries what the transport decided
 * @returns {void}
 */
export const logAppended = entries => {
    if (entries.length > 0) store.dispatch(logAppendedAction({ entries }));
};

export const repeatToggledAction = createAction("repeatToggledAction");

/**
 * @param {boolean} repeat whether a segment repeats at its loop boundary
 * @returns {void}
 */
export const repeatToggled = repeat => {
    store.dispatch(repeatToggledAction(repeat));
};
