import BElement from "../../BElement.js";
import { html } from "lit-html";
import { sequence } from "../control/Sequences.js";
import { ticksPerBar, ticksToSeconds } from "../control/parse.js";
import { seconds } from "../../format.js";

class BranchMap extends BElement {

    extractState({ player: { selectedSequence, summaries } }) {
        return { selectedSequence, hasFile: summaries.length > 0 };
    }

    view() {
        const { selectedSequence, hasFile } = this.state;
        const selected = hasFile ? sequence(selectedSequence) : undefined;
        if (!selected) {
            return html`
            <section aria-labelledby="branches-heading">
                <h2 id="branches-heading">Branch pointy</h2>
                <p>Brak wczytanej sekwencji.</p>
            </section>
            `;
        }

        const perBar = ticksPerBar(selected);
        return html`
        <section aria-labelledby="branches-heading">
        <h2 id="branches-heading">Branch pointy</h2>
        ${selected.branches.length === 0
            ? html`<p>Ta sekwencja nie ma punktów skoku — wariant można zmieniać tylko przez wybór sekwencji.</p>`
            : html`
            <table>
                <caption>Sekwencja ${selectedSequence}, ${perBar} ticków na takt</caption>
                <thead>
                    <tr><th scope="col">Indeks</th><th scope="col">Tick</th><th scope="col">Takt</th><th scope="col">Czas</th></tr>
                </thead>
                <tbody>
                    ${selected.branches.map(branch => this.row(branch, perBar))}
                </tbody>
            </table>
            `}
        </section>
        `;
    }

    /**
     * @param {import("../control/branches.js").BranchPoint} branch the branch point
     * @param {number} perBar ticks in one bar
     * @returns {unknown} a lit-html template
     */
    row({ index, tick = 0 }, perBar) {
        return html`
        <tr>
            <td class="numeric">${index}</td>
            <td class="numeric">${tick}</td>
            <td class="numeric">${Math.floor(tick / perBar) + 1}</td>
            <td class="numeric">${seconds(ticksToSeconds(tick), 2)}</td>
        </tr>
        `;
    }
}

customElements.define("b-player-branches", BranchMap);
