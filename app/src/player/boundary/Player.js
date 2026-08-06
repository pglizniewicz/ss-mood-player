import BElement from "../../BElement.js";
import { html } from "lit-html";
import { scoreCycle, selectScore } from "../control/sequences.js";
import { repeatToggled } from "../control/engine.js";
import { play, sampleRate, startEngine, stop, useSoundBank } from "./AudioOut.js";
import "./Theme.js";
import "./SequenceList.js";
import "./Structure.js";
import "./DebugLog.js";

const ENGINE_LABELS = {
    idle: "engine not started",
    starting: "starting…",
    ready: "engine ready",
    failed: "engine failed"
};

const MEGABYTE = 1024 * 1024;

class Player extends BElement {

    extractState({ player }) {
        return player;
    }

    view() {
        const { engine, engineMessage } = this.state;
        return html`
        <section aria-labelledby="transport-heading">
            <h2 id="transport-heading">Playback</h2>
            <p role="status">${this.status()}</p>
            ${engineMessage ? html`<p class="error">${engineMessage}</p>` : ""}
            <div class="controls">
                <button type="button" @click="${() => startEngine()}"
                    ?disabled="${engine === "ready" || engine === "starting"}">
                    Start engine
                </button>
                <button type="button" @click="${() => this.playScore()}" ?disabled="${!this.canPlay()}">
                    Play score
                </button>
                <button type="button" @click="${stop}" ?disabled="${!this.state.isPlaying}">
                    Stop
                </button>
            </div>
            ${this.canPlay() ? "" : html`
            <ul class="missing">
                ${this.missing().map(reason => html`<li>${reason}</li>`)}
            </ul>`}
            ${this.scorePicker()}
            <label>
                <input type="checkbox" .checked="${this.state.repeatSegment}"
                    @change="${({ target: { checked } }) => repeatToggled(checked)}">
                Loop a single module instead of following the score's cycle
            </label>
            <label for="bank">Custom SoundFont (optional)</label>
            <input id="bank" type="file" accept=".sf2,.sf3,.dls" @change="${this.pickBank}">
        </section>
        <b-player-theme></b-player-theme>
        <b-player-sequences></b-player-sequences>
        <b-player-structure></b-player-structure>
        <b-player-log></b-player-log>
        `;
    }

    /** @returns {unknown} the one-line status the screen reader announces */
    status() {
        const { engine, bankLoaded, bankTotal, bankPresets, isPlaying, playingSequence } = this.state;
        if (engine === "ready" && bankPresets === 0 && bankTotal > 0) {
            return html`loading sound bank — ${(bankLoaded / MEGABYTE).toFixed(1)} of ${(bankTotal / MEGABYTE).toFixed(1)} MB`;
        }
        if (engine === "ready" && bankPresets > 0) {
            return html`${ENGINE_LABELS[engine]} — ${sampleRate()} Hz, ${bankPresets} presets${
                isPlaying ? html` · playing module ${playingSequence}` : ""}`;
        }
        return ENGINE_LABELS[engine];
    }

    /** @returns {boolean} whether a faithful playback is possible */
    canPlay() {
        const { engine, bankPresets, summaries, scores } = this.state;
        return engine === "ready" && bankPresets > 0 && summaries.length > 0 && scores.length > 0;
    }

    /**
     * Everything still standing in the way, listed at once rather than one at a time: a listener
     * with no files loaded should see the whole requirement, not discover it in stages.
     *
     * @returns {string[]} the reasons playback is not possible yet
     */
    missing() {
        const { engine, bankPresets, bankTotal, summaries, scores } = this.state;
        return [
            engine !== "ready"
                ? "Start the engine — audio in the browser only starts from a user gesture."
                : "",
            engine === "ready" && bankPresets === 0 && bankTotal > 0 ? "The sound bank is still loading." : "",
            summaries.length === 0 ? "Load an XMI file with music modules." : "",
            scores.length === 0
                ? "Load the score tables (THMn.BIN). Without them there is no way to know in what order the modules play — the XMI alone is a bank of four-bar fragments in several keys, and the order lives in this file."
                : ""
        ].filter(reason => reason !== "");
    }

    /** @returns {unknown} the intensity-level picker, once the tables are known */
    scorePicker() {
        const { scores, selectedScore } = this.state;
        if (scores.length === 0) return "";
        return html`
        <fieldset>
            <legend>Score (intensity level)</legend>
            ${scores.map(({ index, sequences: cycle, keys }) => html`
            <label>
                <input type="radio" name="score" value="${index}" .checked="${index === selectedScore}"
                    @change="${() => selectScore(index)}">
                ${index}: modules <span class="numeric">${cycle.join(" → ")}</span>
                <em>keys ${keys.join(",")}</em>
            </label>
            `)}
        </fieldset>
        `;
    }

    playScore() {
        const cycle = scoreCycle(this.state.selectedScore);
        play(cycle[0] ?? this.state.selectedSequence, this.state.repeatSegment, cycle);
    }

    /**
     * @param {{target: HTMLInputElement}} event the file input's change event
     * @returns {Promise<void>}
     */
    async pickBank({ target }) {
        const [file] = target.files ?? [];
        if (!file) return;
        useSoundBank(await file.arrayBuffer());
    }
}

customElements.define("b-player", Player);
