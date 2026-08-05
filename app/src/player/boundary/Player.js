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
    idle: "silnik nieuruchomiony",
    starting: "uruchamianie…",
    ready: "silnik gotowy",
    failed: "błąd silnika"
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
            <h2 id="transport-heading">Odtwarzanie</h2>
            <p role="status">${this.status()}</p>
            ${engineMessage ? html`<p class="error">${engineMessage}</p>` : ""}
            <div class="controls">
                <button type="button" @click="${() => startEngine()}"
                    ?disabled="${engine === "ready" || engine === "starting"}">
                    Uruchom silnik
                </button>
                <button type="button" @click="${() => this.playScore()}" ?disabled="${!this.canPlay()}">
                    Odtwórz partyturę
                </button>
                <button type="button" @click="${stop}" ?disabled="${!this.state.isPlaying}">
                    Zatrzymaj
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
                Zapętl pojedynczy moduł, zamiast iść dalej cyklem partytury
            </label>
            <label for="bank">Własny SoundFont (opcjonalnie)</label>
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
            return html`ładowanie banku — ${(bankLoaded / MEGABYTE).toFixed(1)} z ${(bankTotal / MEGABYTE).toFixed(1)} MB`;
        }
        if (engine === "ready" && bankPresets > 0) {
            return html`${ENGINE_LABELS[engine]} — ${sampleRate()} Hz, ${bankPresets} presetów${
                isPlaying ? html` · gra moduł ${playingSequence}` : ""}`;
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
                ? "Uruchom silnik — audio w przeglądarce startuje tylko z gestu użytkownika."
                : "",
            engine === "ready" && bankPresets === 0 && bankTotal > 0 ? "Bank dźwięków jeszcze się ładuje." : "",
            summaries.length === 0 ? "Wgraj plik XMI z modułami muzycznymi." : "",
            scores.length === 0
                ? "Wgraj tabele partytury (THMn.BIN). Bez nich nie wiadomo, w jakiej kolejności grać moduły — sam XMI to bank czterotaktowych fragmentów w kilku tonacjach, a kolejność siedzi w tym pliku."
                : ""
        ].filter(reason => reason !== "");
    }

    /** @returns {unknown} the intensity-level picker, once the tables are known */
    scorePicker() {
        const { scores, selectedScore } = this.state;
        if (scores.length === 0) return "";
        return html`
        <fieldset>
            <legend>Partytura (poziom natężenia)</legend>
            ${scores.map(({ index, sequences: cycle, keys }) => html`
            <label>
                <input type="radio" name="score" value="${index}" .checked="${index === selectedScore}"
                    @change="${() => selectScore(index)}">
                ${index}: moduły <span class="numeric">${cycle.join(" → ")}</span>
                <em>tonacje ${keys.join(",")}</em>
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
