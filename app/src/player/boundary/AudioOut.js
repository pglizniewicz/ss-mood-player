import {
    bankProgress,
    bankReady,
    engineStateChanged,
    logAppended,
    playbackStarted,
    positionChanged
} from "../control/engine.js";

const WORKLET_URL = new URL("../../worklet/SynthProcessor.js", import.meta.url);
const BANK_URL = new URL("../../assets/GeneralUserGS.sf3", import.meta.url);
const PROCESSOR_NAME = "synth-processor";

let context;
let synthNode;

/**
 * iOS Safari keeps Web Audio muted by the hardware silent switch until a plain media element has
 * played once, so a silent buffer is started on the same gesture.
 *
 * @param {AudioContext} audioContext the freshly created context
 * @returns {void}
 */
const unmute = audioContext => {
    const source = audioContext.createBufferSource();
    source.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    source.connect(audioContext.destination);
    source.start();
};

/**
 * Fetches the sound bank, reporting progress: it is several megabytes, and on a phone a silent
 * wait is indistinguishable from a broken page.
 *
 * @param {URL | string} url where the bank lives
 * @returns {Promise<ArrayBuffer>} its bytes
 */
const fetchBank = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`sound bank ${response.status} ${response.statusText}`);

    const total = Number(response.headers.get("content-length") ?? 0);
    if (!response.body) return response.arrayBuffer();

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        bankProgress(loaded, total);
    }

    const bytes = new Uint8Array(loaded);
    let at = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
    }
    return bytes.buffer;
};

/**
 * @param {MessageEvent} event a message from the audio thread
 * @returns {void}
 */
const receive = ({ data }) => {
    if (data.type === "ready") return engineStateChanged("ready");
    if (data.type === "failed") return engineStateChanged("failed", data.message);
    if (data.type === "bankReady") return bankReady(data.presets);
    if (data.type === "position") {
        positionChanged({ sequence: data.sequence, tick: data.tick, stopped: data.stopped });
        logAppended(data.entries ?? []);
    }
};

/**
 * Starts the audio engine. Must be called from a user-gesture handler — iOS Safari only lets an
 * AudioContext reach `running` inside one.
 *
 * @param {string | URL} [bankUrl] a sound bank to use instead of the bundled one
 * @returns {Promise<void>} resolves once the worklet and the bank are loaded
 */
export const startEngine = async (bankUrl = BANK_URL) => {
    if (synthNode) return;
    engineStateChanged("starting");
    context = new AudioContext();
    if (!context.audioWorklet) {
        engineStateChanged("failed", "This browser does not offer AudioWorklet — an HTTPS connection (secure context) is required.");
        return;
    }
    unmute(context);
    try {
        await context.audioWorklet.addModule(WORKLET_URL);
        await context.resume();
        synthNode = new AudioWorkletNode(context, PROCESSOR_NAME, { outputChannelCount: [2] });
        synthNode.connect(context.destination);
        synthNode.port.onmessage = receive;

        const bytes = await fetchBank(bankUrl);
        synthNode.port.postMessage({ type: "soundBank", bytes }, [bytes]);
    } catch (cause) {
        engineStateChanged("failed", cause.message);
    }
};

/**
 * @param {ArrayBuffer} bytes a sound bank the listener supplied
 * @returns {void}
 */
export const useSoundBank = bytes => {
    synthNode?.port.postMessage({ type: "soundBank", bytes }, [bytes]);
};

/**
 * The audio thread runs the transport, so it needs the sequences themselves. They are plain
 * data, which is what makes posting them across the thread boundary possible at all.
 *
 * @param {import("../control/parse.js").XmiSequence[]} sequences the parsed file
 * @returns {void}
 */
export const useSequences = sequences => {
    synthNode?.port.postMessage({ type: "sequences", sequences });
};

/**
 * @param {number} index the segment to play
 * @param {boolean} repeat whether it repeats at its loop boundary
 * @param {number[]} [cycle] a score's module cycle, which the transport follows at each boundary
 * @returns {void}
 */
export const play = (index, repeat, cycle) => {
    synthNode?.port.postMessage({ type: "play", index, repeat, cycle });
    playbackStarted(index);
};

/** @returns {void} */
export const stop = () => synthNode?.port.postMessage({ type: "stop" });

/**
 * @param {number} index the segment to move to
 * @param {"atSegmentEnd" | "now"} when when the move takes effect
 * @returns {void}
 */
export const switchTo = (index, when) => {
    synthNode?.port.postMessage({ type: "switch", index, when });
    playbackStarted(index);
};

/** @returns {number} the sample rate the engine runs at, 0 when not started */
export const sampleRate = () => context?.sampleRate ?? 0;

/** @returns {boolean} whether the engine has been started */
export const isStarted = () => synthNode !== undefined;
