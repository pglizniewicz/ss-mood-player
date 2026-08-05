import BElement from "../../BElement.js";
import { html } from "lit-html";
import { loadFile, sequences } from "../control/sequences.js";
import { repeatToggled } from "../control/engine.js";
import { play, sampleRate, startEngine, stop, useSequences, useSoundBank } from "./AudioOut.js";
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
        const { engine, engineMessage, fileName, fileSize, fileError } = this.state;
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
                <button type="button" @click="${() => this.playSelected()}"
                    ?disabled="${!this.canPlay()}">
                    Odtwórz
                </button>
                <button type="button" @click="${stop}" ?disabled="${!this.state.isPlaying}">
                    Zatrzymaj
                </button>
            </div>
            <label>
                <input type="checkbox" .checked="${this.state.repeatSegment}"
                    @change="${({ target: { checked } }) => repeatToggled(checked)}">
                Zapętl segment (udogodnienie odsłuchowe — w grze segment kończy się i silnik wybiera następny)
            </label>
        </section>
        <section aria-labelledby="file-heading">
            <h2 id="file-heading">Plik</h2>
            <label for="xmi">Plik XMI</label>
            <input id="xmi" type="file" accept=".xmi,.XMI" @change="${this.pickFile}">
            ${fileName && !fileError ? html`<p>${fileName} — ${fileSize} bajtów</p>` : ""}
            ${fileError ? html`<p class="error">${fileName}: ${fileError}</p>` : ""}
            <label for="bank">Własny SoundFont (opcjonalnie)</label>
            <input id="bank" type="file" accept=".sf2,.sf3,.dls" @change="${this.pickBank}">
        </section>
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
                isPlaying ? html` · gra sekwencja ${playingSequence}` : ""}`;
        }
        return ENGINE_LABELS[engine];
    }

    /** @returns {boolean} whether there is something to play and something to play it with */
    canPlay() {
        return this.state.engine === "ready" && this.state.bankPresets > 0 && this.state.summaries.length > 0;
    }

    playSelected() {
        useSequences(sequences());
        play(this.state.selectedSequence, this.state.repeatSegment);
    }

    /**
     * Reading the bytes is the boundary's job: the control layer takes an ArrayBuffer so it stays
     * free of DOM types and runnable under `node --test`.
     *
     * @param {{target: HTMLInputElement}} event the file input's change event
     * @returns {Promise<void>}
     */
    async pickFile({ target }) {
        const [file] = target.files ?? [];
        if (!file) return;
        loadFile(file.name, await file.arrayBuffer());
        useSequences(sequences());
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
