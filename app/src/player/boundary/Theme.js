import BElement from "../../BElement.js";
import { html } from "lit-html";
import { loadFile, loadScore, sequences } from "../control/sequences.js";
import { useSequences } from "./AudioOut.js";

/**
 * Takes in a whole theme: the XMI holding the modules and the score tables that say which module
 * plays when. Both are required, because the XMI alone cannot be played faithfully — it is a bank
 * of four-bar modules in several keys, and the order lives in the tables.
 */
class Theme extends BElement {

    extractState({ player: { fileName, fileSize, fileError, scoreName, scoreError, hasChunkTable, scores } }) {
        return { fileName, fileSize, fileError, scoreName, scoreError, hasChunkTable, scores };
    }

    view() {
        const { fileName, fileSize, fileError, scoreName, scoreError, hasChunkTable, scores } = this.state;
        return html`
        <section aria-labelledby="theme-heading">
            <h2 id="theme-heading">Theme</h2>
            <label for="theme">Theme files — <code>THMn.XMI</code>, <code>THMn.BIN</code> and <code>THMn.DAT</code></label>
            <input id="theme" type="file" multiple accept=".xmi,.bin,.dat,.XMI,.BIN,.DAT"
                @change="${this.pickTheme}">
            <p>Select all three at once. You can also pick them in separate rounds.</p>

            <ul class="checklist">
                <li>${this.item(fileName !== "" && fileError === "", "XMI (modules)", fileName, fileError)}</li>
                <li>${this.item(scores.length > 0, "BIN (score tables)", scoreName, scoreError)}</li>
                <li>${this.item(hasChunkTable, "DAT (module descriptions)", hasChunkTable ? "loaded" : "missing — optional", "")}</li>
            </ul>

            ${fileName && !fileError ? html`<p>${fileName} — ${fileSize} bytes</p>` : ""}
            ${fileError ? html`<p class="error">${fileName}: ${fileError}</p>` : ""}
            ${scoreError ? html`<p class="error">${scoreName}: ${scoreError}</p>` : ""}
        </section>
        `;
    }

    /**
     * @param {boolean} present whether the file is loaded
     * @param {string} label what it is
     * @param {string} detail extra text
     * @param {string} error why it failed
     * @returns {unknown} a lit-html template
     */
    item(present, label, detail, error) {
        return html`
        <span class="${present ? "ok" : error ? "error" : "missing"}">${present ? "✓" : "•"}</span>
        ${label}${detail ? html` — ${detail}` : ""}
        `;
    }

    /**
     * Reading bytes is the boundary's job; the control layer takes ArrayBuffers so it stays free
     * of DOM types.
     *
     * @param {{target: HTMLInputElement}} event the file input's change event
     * @returns {Promise<void>}
     */
    async pickTheme({ target }) {
        const files = [...(target.files ?? [])];
        const of = extension => files.find(file => file.name.toLowerCase().endsWith(extension));

        const xmi = of(".xmi");
        if (xmi) {
            loadFile(xmi.name, await xmi.arrayBuffer());
            useSequences(sequences());
        }

        const bin = of(".bin");
        const dat = of(".dat");
        if (bin) {
            loadScore(bin.name, await bin.arrayBuffer(), dat ? await dat.arrayBuffer() : undefined);
        }
    }
}

customElements.define("b-player-theme", Theme);
