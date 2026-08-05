import BElement from "../../BElement.js";
import { html } from "lit-html";
import { changeSwitchWhen } from "../control/sequences.js";

const KINDS = {
    started: "start",
    requested: "zamówiono",
    segmentEnded: "koniec segmentu",
    switched: "przełączono",
    repeated: "powtórzono",
    stopped: "zatrzymano"
};

class DebugLog extends BElement {

    extractState({ player: { log, switchWhen, positionTick, isPlaying } }) {
        return { log, switchWhen, positionTick, isPlaying };
    }

    view() {
        const { log, switchWhen, positionTick, isPlaying } = this.state;
        return html`
        <section aria-labelledby="log-heading">
            <h2 id="log-heading">Przebieg</h2>
            <fieldset>
                <legend>Zmiana wariantu</legend>
                ${this.option("atSegmentEnd", "na granicy pętli", switchWhen)}
                ${this.option("now", "natychmiast", switchWhen)}
            </fieldset>
            <p>Pozycja: <span class="numeric">tick ${positionTick}</span>${isPlaying ? "" : " (cisza)"}</p>
            ${log.length === 0
                ? html`<p>Jeszcze nic nie zagrało.</p>`
                : html`
                <ul class="log">
                    ${log.map(entry => html`
                    <li>
                        <span class="numeric">${String(entry.tick).padStart(5)}</span>
                        ${KINDS[entry.kind] ?? entry.kind}
                        ${entry.sequence === undefined ? "" : html`seq ${entry.sequence}`}
                        ${entry.from === undefined ? "" : html`z ${entry.from}`}
                        ${entry.reason ? html`<em>${entry.reason}</em>` : ""}
                    </li>
                    `)}
                </ul>
                `}
        </section>
        `;
    }

    /**
     * @param {"atSegmentEnd" | "now"} value the option's value
     * @param {string} label what to call it
     * @param {string} current the selected value
     * @returns {unknown} a lit-html template
     */
    option(value, label, current) {
        return html`
        <label>
            <input type="radio" name="switchWhen" value="${value}" .checked="${current === value}"
                @change="${() => changeSwitchWhen(value)}">
            ${label}
        </label>
        `;
    }
}

customElements.define("b-player-log", DebugLog);
