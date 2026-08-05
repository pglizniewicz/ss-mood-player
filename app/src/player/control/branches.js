/**
 * Branch points are what makes a variant change mid-song possible: the `RBRN` chunk maps a
 * branch index to a byte offset inside `EVNT`, and the sequence jumps there when asked.
 *
 * @typedef {object} BranchPoint
 * @property {number} index branch index, 0-127
 * @property {number} offset byte offset into the EVNT body
 * @property {number} [tick] absolute tick of the event at that offset, once resolved
 * @property {number} [eventIndex] position in the event stream, once resolved
 */

const ENTRY_SIZE = 6;
const MAX_BRANCH_INDEX = 128;

/** The XMIDI controller that marks a branch point in the event stream itself. */
export const SEQUENCE_BRANCH_INDEX = 120;

/** XMIDI loop controllers, kept here so the scheduler and the UI agree on the numbers. */
export const FOR_LOOP = 116;
export const NEXT_BREAK = 117;
export const CALLBACK_TRIGGER = 119;

/**
 * @param {DataView} view the file
 * @param {number} start first byte of the RBRN body
 * @param {number} end one past its last byte
 * @returns {BranchPoint[]} declared branch points, in file order
 */
export const readBranches = (view, start, end) => {
    if (end - start < 2) return [];
    const count = view.getUint16(start, true);

    return Array.from({ length: count }, (_, entry) => {
        const at = start + 2 + entry * ENTRY_SIZE;
        return {
            index: view.getUint16(at, true),
            offset: view.getUint32(at + 2, true)
        };
    }).filter(({ index }) => index < MAX_BRANCH_INDEX);
};

/**
 * Attaches the tick and event position to each branch point. Offsets are relative to the
 * start of the EVNT body, and every event carries its own absolute offset, so a branch
 * resolves to the first event at or after it.
 *
 * @param {BranchPoint[]} branches branch points from RBRN
 * @param {import("./events.js").XmiEvent[]} events the parsed event stream
 * @param {number} eventsStart byte offset where the EVNT body begins
 * @returns {BranchPoint[]} branch points with `tick` and `eventIndex` filled in
 */
export const resolveBranches = (branches, events, eventsStart) =>
    branches
        .map(branch => {
            const absolute = eventsStart + branch.offset;
            const eventIndex = events.findIndex(event => event.offset >= absolute);
            if (eventIndex === -1) return undefined;
            return { ...branch, eventIndex, tick: events[eventIndex].tick };
        })
        .filter(branch => branch !== undefined);

/**
 * Branch points implied by the event stream, used when a file marks branches with
 * controller 120 but ships no RBRN chunk.
 *
 * @param {import("./events.js").XmiEvent[]} events the parsed event stream
 * @returns {BranchPoint[]} branch points derived from controller 120 events
 */
export const branchesFromEvents = events =>
    events
        .map((event, eventIndex) => ({ event, eventIndex }))
        .filter(({ event }) => event.type === "controller" && event.data1 === SEQUENCE_BRANCH_INDEX)
        .map(({ event, eventIndex }) => ({
            index: event.data2 ?? 0,
            offset: event.offset,
            eventIndex,
            tick: event.tick
        }));
