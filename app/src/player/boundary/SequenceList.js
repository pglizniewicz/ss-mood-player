import BElement from "../../BElement.js";
import { html } from "lit-html";
import { selectSequence } from "../control/Sequences.js";
import { plural, seconds } from "../../format.js";

class SequenceList extends BElement {

    extractState({ player: { summaries, selectedSequence, declaredSequenceCount } }) {
        return { summaries, selectedSequence, declaredSequenceCount };
    }

    view() {
        const { summaries, selectedSequence, declaredSequenceCount } = this.state;
        return html`
        <section aria-labelledby="sequences-heading">
        <h2 id="sequences-heading">Sekwencje</h2>
        ${summaries.length === 0
            ? html`<p>Wgraj plik XMI, aby zobaczyć jego sekwencje.</p>`
            : html`
            <p>
                ${summaries.length} ${plural(summaries.length, {
                    one: "sekwencja",
                    few: "sekwencje",
                    many: "sekwencji"
                })} w pliku${
                    declaredSequenceCount > 0 && declaredSequenceCount !== summaries.length
                        ? html` (chunk INFO deklaruje ${declaredSequenceCount})`
                        : ""}
            </p>
            <ol>
                ${summaries.map(summary => this.row(summary, summary.index === selectedSequence))}
            </ol>
            `}
        </section>
        `;
    }

    /**
     * @param {import("../control/Sequences.js").SequenceSummary} summary the sequence
     * @param {boolean} isSelected whether it is the sequence in focus
     * @returns {unknown} a lit-html template
     */
    row({ index, durationSeconds, channels, branchIndices, numerator, denominator, eventCount }, isSelected) {
        return html`
        <li>
            <label>
                <input type="radio" name="sequence" value="${index}" .checked="${isSelected}"
                    @change="${() => selectSequence(index)}">
                <span class="numeric">${seconds(durationSeconds)}</span> ·
                ${numerator}/${denominator} ·
                ${eventCount} ${plural(eventCount, { one: "zdarzenie", few: "zdarzenia", many: "zdarzeń" })} ·
                ${plural(channels.length, { one: "kanał", few: "kanały", many: "kanały" })}
                ${channels.join(", ") || "—"} ·
                ${branchIndices.length} branch
            </label>
        </li>
        `;
    }
}

customElements.define("b-player-sequences", SequenceList);
