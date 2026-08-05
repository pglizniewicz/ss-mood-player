import { SpessaSynthProcessor, SoundBankLoader } from "../libs/spessasynth_core.js";
import { createTransport } from "../player/control/transport.js";
import { apply } from "../player/control/dispatch.js";

/**
 * Renders the synthesizer inside the audio thread, and runs the transport there too: a variant
 * switch has to land exactly on a loop boundary, and only the audio thread knows where that is
 * to the sample.
 *
 * The imports are deliberately relative — an import map does not apply inside
 * `AudioWorkletGlobalScope`, so the vendored module has to be addressed by path.
 */

const RENDER_QUANTUM = 128;
/** Position updates every 32 quanta is about 85 ms at 48 kHz: smooth enough, cheap enough. */
const REPORT_EVERY = 32;

class SynthProcessor extends AudioWorkletProcessor {

    constructor() {
        super();
        this.synth = new SpessaSynthProcessor(sampleRate, {
            eventsEnabled: false,
            maxBufferSize: RENDER_QUANTUM
        });
        this.sequences = [];
        this.transport = undefined;
        this.reportedEntries = 0;
        this.quanta = 0;

        this.ready = false;
        /** @type {object | undefined} */
        this.queuedPlay = undefined;

        this.port.onmessage = ({ data }) => this.handle(data);
        this.synth.processorInitialized
            .then(() => {
                this.ready = true;
                this.port.postMessage({ type: "ready", sampleRate });
                if (this.queuedPlay) {
                    const { index, repeat } = this.queuedPlay;
                    this.queuedPlay = undefined;
                    this.play(index, repeat);
                }
            })
            .catch(cause => this.port.postMessage({ type: "failed", message: cause.message }));
    }

    /**
     * @param {object} message a command from the main thread
     * @returns {void}
     */
    handle(message) {
        if (message.type === "soundBank") return this.loadBank(message.bytes);
        if (message.type === "sequences") {
            this.sequences = message.sequences;
            return;
        }
        if (message.type === "play") return this.play(message.index, message.repeat);
        if (message.type === "stop") return this.stop();
        if (message.type === "switch") return this.switchTo(message.index, message.when);
    }

    /**
     * @param {ArrayBuffer} bytes the sound bank file
     * @returns {void}
     */
    loadBank(bytes) {
        try {
            const bank = SoundBankLoader.fromArrayBuffer(bytes);
            this.synth.soundBankManager.addSoundBank(bank, "main");
            this.port.postMessage({ type: "bankReady", presets: bank.presets.length });
        } catch (cause) {
            this.port.postMessage({ type: "failed", message: `sound bank: ${cause.message}` });
        }
    }

    /**
     * @param {number} index the segment to play
     * @param {boolean} repeat whether it repeats at its loop boundary
     * @returns {void}
     */
    play(index, repeat) {
        // An SF3 bank whose Vorbis decoder is not ready yet decodes to silence and caches that
        // silence permanently, so the first note must wait.
        if (!this.ready) {
            this.queuedPlay = { index, repeat };
            return;
        }
        this.transport = createTransport({
            sampleRate,
            sequenceAt: at => this.sequences[at],
            repeatSegment: repeat
        });
        this.reportedEntries = 0;
        this.pending = this.transport.start(index);
        this.report();
    }

    stop() {
        this.synth.stopAllChannels(true);
        this.transport = undefined;
        this.pending = undefined;
        this.port.postMessage({ type: "stopped" });
    }

    /**
     * @param {number} index the segment to move to
     * @param {"atSegmentEnd" | "now"} when when the move takes effect
     * @returns {void}
     */
    switchTo(index, when) {
        if (!this.transport) return this.play(index, true);
        this.pending = [...(this.pending ?? []), ...this.transport.requestSequence(index, when)];
        this.report();
    }

    /** Sends whatever the transport decided since the last report. */
    report() {
        if (!this.transport) return;
        const entries = this.transport.log().slice(this.reportedEntries);
        this.reportedEntries += entries.length;
        const { sequence, tick, stopped } = this.transport.state();
        this.port.postMessage({ type: "position", sequence, tick, stopped, entries });
    }

    process(_inputs, outputs) {
        const [left, right] = outputs[0];
        if (!this.transport) return true;

        const scheduled = [...(this.pending ?? []), ...this.transport.advance(left.length)];
        this.pending = undefined;
        let written = 0;

        for (const { offset, action } of scheduled) {
            const target = Math.min(Math.max(offset, 0), left.length);
            if (target > written) {
                this.synth.process(left, right, written, target - written);
                written = target;
            }
            apply(action, this.synth);
        }
        if (written < left.length) this.synth.process(left, right, written, left.length - written);

        this.quanta += 1;
        if (this.quanta % REPORT_EVERY === 0 || this.transport.state().stopped) this.report();
        return true;
    }
}

registerProcessor("synth-processor", SynthProcessor);
