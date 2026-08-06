import BElement from "../../BElement.js";
import { html } from "lit-html";
import { changeSwitchWhen } from "../control/sequences.js";

const KINDS = {
    started: "start",
    requested: "requested",
    segmentEnded: "segment ended",
    switched: "switched",
    repeated: "repeated",
    stopped: "stopped"
};

class DebugLog extends BElement {

    extractState({ player: { log, switchWhen, positionTick, isPlaying } }) {
        return { log, switchWhen, positionTick, isPlaying };
    }

    view() {
        const { log, switchWhen, positionTick, isPlaying } = this.state;
        return html`
        <section aria-labelledby="log-heading">
            <h2 id="log-heading">Log</h2>
            <fieldset>
                <legend>Variant switch</legend>
                ${this.option("atSegmentEnd", "at loop boundary", switchWhen)}
                ${this.option("now", "immediately", switchWhen)}
            </fieldset>
            <p>Position: <span class="numeric">tick ${positionTick}</span>${isPlaying ? "" : " (silent)"}</p>
            ${log.length === 0
                ? html`<p>Nothing has played yet.</p>`
                : html`
                <ul class="log">
                    ${log.map(entry => html`
                    <li>
                        <span class="numeric">${String(entry.tick).padStart(5)}</span>
                        ${KINDS[entry.kind] ?? entry.kind}
                        ${entry.sequence === undefined ? "" : html`seq ${entry.sequence}`}
                        ${entry.from === undefined ? "" : html`from ${entry.from}`}
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
