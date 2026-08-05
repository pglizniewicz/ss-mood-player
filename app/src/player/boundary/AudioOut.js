import { engineStateChanged } from "../control/Transport.js";

const WORKLET_URL = new URL("../../worklet/SynthProcessor.js", import.meta.url);
const PROCESSOR_NAME = "synth-processor";

let context;
let synthNode;

/**
 * iOS Safari keeps Web Audio muted by the hardware silent switch until a plain
 * media element has played once, so a silent buffer is started on the same gesture.
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
 * Starts the audio engine. Must be called from a user-gesture handler — iOS Safari
 * only lets an AudioContext reach `running` inside one.
 *
 * @returns {Promise<void>} resolves once the worklet reports readiness
 */
export const startEngine = async () => {
    if (synthNode) return;
    engineStateChanged("starting");
    context = new AudioContext();
    if (!context.audioWorklet) {
        engineStateChanged("failed", "Ta przeglądarka nie udostępnia AudioWorklet — wymagane jest połączenie HTTPS (secure context).");
        return;
    }
    unmute(context);
    try {
        await context.audioWorklet.addModule(WORKLET_URL);
        await context.resume();
        synthNode = new AudioWorkletNode(context, PROCESSOR_NAME, { outputChannelCount: [2] });
        synthNode.connect(context.destination);
        synthNode.port.onmessage = ({ data: { type, message } }) =>
            engineStateChanged(type === "ready" ? "ready" : "failed", message);
    } catch (cause) {
        engineStateChanged("failed", cause.message);
    }
};

/**
 * @param {{type: string}} command message understood by the worklet processor
 * @returns {void}
 */
export const send = command => synthNode?.port.postMessage(command);

/**
 * @returns {number} the sample rate the engine runs at, 0 when not started
 */
export const sampleRate = () => context?.sampleRate ?? 0;
