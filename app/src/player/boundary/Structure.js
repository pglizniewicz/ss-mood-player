import BElement from "../../BElement.js";
import { html } from "lit-html";
import { sequence } from "../control/Sequences.js";
import { loopBars, ticksPerBar, ticksToSeconds } from "../control/parse.js";
import { decimal, seconds } from "../../format.js";

class Structure extends BElement {

    extractState({ player: { selectedSequence, summaries } }) {
        return { selectedSequence, hasFile: summaries.length > 0 };
    }

    view() {
        const { selectedSequence, hasFile } = this.state;
        const selected = hasFile ? sequence(selectedSequence) : undefined;

        return html`
        <section aria-labelledby="structure-heading">
        <h2 id="structure-heading">Struktura</h2>
        ${!selected
            ? html`<p>Brak wczytanej sekwencji.</p>`
            : html`
            <p>
                Sekwencja ${selectedSequence}, takt =
                <span class="numeric">${decimal(ticksPerBar(selected))}</span> ticka
            </p>
            ${this.loop(selected)}
            ${this.branches(selected)}
            `}
        </section>
        `;
    }

    /**
     * @param {import("../control/parse.js").XmiSequence} selected the sequence in focus
     * @returns {unknown} a lit-html template
     */
    loop({ loop, ...rest }) {
        if (!loop) return html`<p>Bez pętli XMIDI — sekwencja gra raz i się kończy.</p>`;
        const bars = loopBars({ loop, ...rest });
        return html`
        <table>
            <caption>Pętla XMIDI (kontrolery 116 / 117)</caption>
            <tbody>
                <tr><th scope="row">Początek</th><td class="numeric">tick ${loop.startTick}</td></tr>
                <tr><th scope="row">Koniec</th><td class="numeric">tick ${loop.endTick}</td></tr>
                <tr>
                    <th scope="row">Długość</th>
                    <td class="numeric">${loop.ticks} ticków = ${decimal(bars, 2)} taktu / ${seconds(ticksToSeconds(loop.ticks), 2)}</td>
                </tr>
                <tr>
                    <th scope="row">Powtórzenia</th>
                    <td>${loop.repeats === 0 ? "bez końca" : loop.repeats}</td>
                </tr>
            </tbody>
        </table>
        <p>
            Pętli nie wykonujemy jako nieskończonej — w System Shocku segment musi się skończyć,
            żeby silnik nastrojów mógł wybrać następny.
        </p>
        `;
    }

    /**
     * @param {import("../control/parse.js").XmiSequence} selected the sequence in focus
     * @returns {unknown} a lit-html template
     */
    branches(selected) {
        if (selected.branches.length === 0) {
            return html`
            <p>
                Brak punktów skoku (chunk <code>RBRN</code> / kontroler 120). Pliki System Shocka
                zmieniają wariant osobnymi segmentami, nie skokami w środku utworu.
            </p>`;
        }

        const perBar = ticksPerBar(selected);
        return html`
        <table>
            <caption>Punkty skoku</caption>
            <thead>
                <tr><th scope="col">Indeks</th><th scope="col">Tick</th><th scope="col">Takt</th><th scope="col">Czas</th></tr>
            </thead>
            <tbody>
                ${selected.branches.map(({ index, tick = 0 }) => html`
                <tr>
                    <td class="numeric">${index}</td>
                    <td class="numeric">${tick}</td>
                    <td class="numeric">${Math.floor(tick / perBar) + 1}</td>
                    <td class="numeric">${seconds(ticksToSeconds(tick), 2)}</td>
                </tr>
                `)}
            </tbody>
        </table>
        `;
    }
}

customElements.define("b-player-structure", Structure);
