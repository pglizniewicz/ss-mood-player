import { SpessaSynthProcessor } from "../libs/spessasynth_core.js";

/**
 * Renders the synthesizer inside the audio thread.
 *
 * The import above is deliberately relative: an import map does not apply inside
 * `AudioWorkletGlobalScope`, so the vendored module has to be addressed by path.
 */
class SynthProcessor extends AudioWorkletProcessor {

    constructor() {
        super();
        this.synth = new SpessaSynthProcessor(sampleRate, { eventsEnabled: false });
        this.port.onmessage = ({ data }) => this.handle(data);
        this.synth.processorInitialized
            .then(() => this.port.postMessage({ type: "ready", sampleRate }))
            .catch(cause => this.port.postMessage({ type: "failed", message: cause.message }));
    }

    /**
     * @param {{type: string, soundBank?: ArrayBuffer, channel?: number, note?: number, velocity?: number}} message command from the main thread
     * @returns {void}
     */
    handle({ type, channel, note, velocity }) {
        if (type === "noteOn") return this.synth.noteOn(channel, note, velocity);
        if (type === "noteOff") return this.synth.noteOff(channel, note);
        if (type === "stopAll") return this.synth.stopAllChannels(true);
    }

    process(_inputs, outputs) {
        const [left, right] = outputs[0];
        this.synth.process(left, right);
        return true;
    }
}

registerProcessor("synth-processor", SynthProcessor);
