import BElement from "../../BElement.js";
import { html } from "lit-html";
import { fileSelected } from "../control/Transport.js";
import { startEngine, sampleRate } from "./AudioOut.js";

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
        const { engine, engineMessage, fileName, fileSize } = this.state;
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
            ${fileName ? html`<p>${fileName} — ${fileSize} bajtów</p>` : ""}
        </section>
        `;
    }

    pickFile({ target: { files } }) {
        const [file] = files;
        if (file) fileSelected(file);
    }
}

customElements.define("b-player", Player);
