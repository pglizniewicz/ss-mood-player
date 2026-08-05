/**
 * Minimal store implementing the Redux Toolkit API surface used by this application
 * (`configureStore`, `createAction`, `createReducer`) on top of `structuredClone()`.
 *
 * Case handlers receive a clone of the current slice state and may mutate it freely
 * or return a replacement — there is no Immer.
 *
 * @typedef {{type: string, payload?: unknown}} Action
 * @typedef {(state: unknown, action: Action) => unknown} Reducer
 */

const INIT = "@@reduction/INIT";

/**
 * Creates an action creator carrying its own type.
 *
 * @param {string} type action type
 * @returns {((payload?: unknown) => Action) & {type: string}} action creator
 */
export const createAction = type => {
    const actionCreator = payload => ({ type, payload });
    actionCreator.type = type;
    actionCreator.toString = () => type;
    return actionCreator;
};

/**
 * Builds a reducer from case handlers registered through the builder callback.
 *
 * @param {unknown} initialState state used when the slice is undefined
 * @param {(builder: {addCase: Function}) => void} builderCallback registers the case handlers
 * @returns {Reducer} reducer
 */
export const createReducer = (initialState, builderCallback) => {
    const handlers = new Map();
    const builder = {
        addCase: (actionCreator, handler) => {
            handlers.set(actionCreator.type, handler);
            return builder;
        }
    };
    builderCallback(builder);

    return (state = initialState, action) => {
        const handler = handlers.get(action?.type);
        if (!handler) return state;
        const draft = structuredClone(state);
        return handler(draft, action) ?? draft;
    };
};

/**
 * Creates the store from a map of slice reducers.
 *
 * @param {{reducer: Record<string, Reducer>, preloadedState?: Record<string, unknown>}} config store configuration
 * @returns {{getState: Function, dispatch: Function, subscribe: Function}} store
 */
export const configureStore = ({ reducer, preloadedState }) => {
    const slices = Object.entries(reducer);
    const listeners = new Set();
    let state = Object.fromEntries(slices.map(([name, sliceReducer]) => [
        name,
        preloadedState?.[name] ?? sliceReducer(undefined, { type: INIT })
    ]));

    const dispatch = action => {
        state = Object.fromEntries(slices.map(([name, sliceReducer]) => [
            name,
            sliceReducer(state[name], action)
        ]));
        for (const listener of listeners) listener();
        return action;
    };

    return {
        getState: () => state,
        dispatch,
        subscribe: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }
    };
};
