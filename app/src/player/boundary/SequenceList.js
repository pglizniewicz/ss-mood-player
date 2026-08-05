import BElement from "../../BElement.js";
import { html } from "lit-html";
import { selectSequence, toggleStubs } from "../control/Sequences.js";
import { decimal, plural, seconds } from "../../format.js";

class SequenceList extends BElement {

    extractState({ player: { summaries, selectedSequence, declaredSequenceCount, showStubs } }) {
        return { summaries, selectedSequence, declaredSequenceCount, showStubs };
    }

    view() {
        const { summaries, selectedSequence, declaredSequenceCount, showStubs } = this.state;
        const listed = showStubs ? summaries : summaries.filter(summary => summary.isPlayable);
        const stubCount = summaries.length - summaries.filter(summary => summary.isPlayable).length;

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
            ${stubCount > 0
                ? html`
                <label>
                    <input type="checkbox" .checked="${showStubs}"
                        @change="${({ target: { checked } }) => toggleStubs(checked)}">
                    Pokaż ${stubCount} bez ani jednej nuty (same markery)
                </label>`
                : ""}
            <ul>
                ${listed.map(summary => this.row(summary, summary.index === selectedSequence))}
            </ul>
            `}
        </section>
        `;
    }

    /**
     * @param {import("../control/Sequences.js").SequenceSummary} summary the sequence
     * @param {boolean} isSelected whether it is the sequence in focus
     * @returns {unknown} a lit-html template
     */
    row(summary, isSelected) {
        const { index, name, isPlayable, loopBars, loopSeconds, durationSeconds } = summary;
        const { channels, branchIndices, numerator, denominator, tempoBpm } = summary;
        return html`
        <li>
            <label>
                <input type="radio" name="sequence" value="${index}" .checked="${isSelected}"
                    @change="${() => selectSequence(index)}">
                <strong>${name || `sekwencja ${index}`}</strong>
                ${isPlayable ? "" : html` <em>(bez nut)</em>`}
                <br>
                ${loopBars > 0
                    ? html`<span class="numeric">pętla ${decimal(loopBars, 0)} ${plural(Math.round(loopBars), {
                        one: "takt",
                        few: "takty",
                        many: "taktów"
                    })} / ${seconds(loopSeconds)}</span> · `
                    : html`<span class="numeric">${seconds(durationSeconds)}</span> · `}
                ${numerator}/${denominator} · <span class="numeric">${decimal(tempoBpm, 0)} BPM</span> ·
                ${plural(channels.length, { one: "kanał", few: "kanały", many: "kanały" })}
                ${channels.join(", ") || "—"}${branchIndices.length > 0
                    ? html` · ${branchIndices.length} branch`
                    : ""}
            </label>
        </li>
        `;
    }
}

customElements.define("b-player-sequences", SequenceList);
