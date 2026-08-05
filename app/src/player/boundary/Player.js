import BElement from "../../BElement.js";
import { html } from "lit-html";
import { loadFile } from "../control/Sequences.js";
import { startEngine, sampleRate } from "./AudioOut.js";
import "./SequenceList.js";
import "./BranchMap.js";

const ENGINE_LABELS = {
    idle: "silnik nieuruchomiony",
    starting: "uruchamianie…",
    ready: "silnik gotowy",
    failed: "błąd silnika"
};

class Player extends BElement {

    extractState({ player }) {
        return player;
    }

    view() {
        const { engine, engineMessage, fileName, fileSize, fileError } = this.state;
        return html`
        <section aria-labelledby="transport-heading">
            <h2 id="transport-heading">Odtwarzanie</h2>
            <p role="status">
                ${ENGINE_LABELS[engine]}${engine === "ready" ? html` — ${sampleRate()} Hz` : ""}
            </p>
            ${engineMessage ? html`<p class="error">${engineMessage}</p>` : ""}
            <button type="button" @click="${startEngine}" ?disabled="${engine === "ready" || engine === "starting"}">
                Uruchom silnik
            </button>
        </section>
        <section aria-labelledby="file-heading">
            <h2 id="file-heading">Plik</h2>
            <label for="xmi">Plik XMI</label>
            <input id="xmi" type="file" accept=".xmi,.XMI" @change="${this.pickFile}">
            ${fileName && !fileError ? html`<p>${fileName} — ${fileSize} bajtów</p>` : ""}
            ${fileError ? html`<p class="error">${fileName}: ${fileError}</p>` : ""}
        </section>
        <b-player-sequences></b-player-sequences>
        <b-player-branches></b-player-branches>
        `;
    }

    /**
     * Reading the bytes is the boundary's job: the control layer takes an ArrayBuffer so it
     * stays free of DOM types and runnable under `node --test`.
     *
     * @param {{target: HTMLInputElement}} event the file input's change event
     * @returns {Promise<void>}
     */
    async pickFile({ target }) {
        const [file] = target.files ?? [];
        if (!file) return;
        loadFile(file.name, await file.arrayBuffer());
    }
}

customElements.define("b-player", Player);
