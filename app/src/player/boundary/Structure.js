import BElement from "../../BElement.js";
import { html } from "lit-html";
import { sequence } from "../control/sequences.js";
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
        <h2 id="structure-heading">Structure</h2>
        ${!selected
            ? html`<p>No sequence loaded.</p>`
            : html`
            <p>
                Sequence ${selectedSequence}, bar =
                <span class="numeric">${decimal(ticksPerBar(selected))}</span> ticks
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
        if (!loop) return html`<p>No XMIDI loop — the sequence plays once and ends.</p>`;
        const bars = loopBars({ loop, ...rest });
        return html`
        <div class="scroller"><table>
            <caption>XMIDI loop (controllers 116 / 117)</caption>
            <tbody>
                <tr><th scope="row">Start</th><td class="numeric">tick ${loop.startTick}</td></tr>
                <tr><th scope="row">End</th><td class="numeric">tick ${loop.endTick}</td></tr>
                <tr>
                    <th scope="row">Length</th>
                    <td class="numeric">${loop.ticks} ticks = ${decimal(bars, 2)} bars / ${seconds(ticksToSeconds(loop.ticks), 2)}</td>
                </tr>
                <tr>
                    <th scope="row">Repeats</th>
                    <td>${loop.repeats === 0 ? "endless" : loop.repeats}</td>
                </tr>
            </tbody>
        </table></div>
        <p>
            We do not execute the loop as endless — in System Shock a segment must end so the
            mood engine can pick the next one.
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
                No branch points (chunk <code>RBRN</code> / controller 120). System Shock files
                change variant with separate segments, not jumps within a track.
            </p>`;
        }

        const perBar = ticksPerBar(selected);
        return html`
        <div class="scroller"><table>
            <caption>Branch points</caption>
            <thead>
                <tr><th scope="col">Index</th><th scope="col">Tick</th><th scope="col">Bar</th><th scope="col">Time</th></tr>
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
        </table></div>
        `;
    }
}

customElements.define("b-player-structure", Structure);
