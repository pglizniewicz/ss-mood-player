import BElement from "../../BElement.js";
import { html } from "lit-html";
import { selectSequence, toggleStubs } from "../control/sequences.js";
import { switchTo } from "./AudioOut.js";
import { decimal, plural, seconds } from "../../format.js";

class SequenceList extends BElement {

    extractState({ player: { summaries, selectedSequence, declaredSequenceCount, showStubs, isPlaying, switchWhen } }) {
        return { summaries, selectedSequence, declaredSequenceCount, showStubs, isPlaying, switchWhen };
    }

    /**
     * Choosing a variant while something is sounding is the whole point of the player: it becomes
     * a switch request rather than just a selection.
     *
     * @param {number} index the sequence chosen
     * @returns {void}
     */
    choose(index) {
        selectSequence(index);
        if (this.state.isPlaying) switchTo(index, this.state.switchWhen);
    }

    view() {
        const { summaries, selectedSequence, declaredSequenceCount, showStubs } = this.state;
        const listed = showStubs ? summaries : summaries.filter(summary => summary.isPlayable);
        const stubCount = summaries.length - summaries.filter(summary => summary.isPlayable).length;

        return html`
        <section aria-labelledby="sequences-heading">
        <h2 id="sequences-heading">Sequences</h2>
        ${summaries.length === 0
            ? html`<p>Load an XMI file to see its sequences.</p>`
            : html`
            <p>
                ${summaries.length} ${plural(summaries.length, {
                    one: "sequence",
                    other: "sequences"
                })} in the file${
                    declaredSequenceCount > 0 && declaredSequenceCount !== summaries.length
                        ? html` (the INFO chunk declares ${declaredSequenceCount})`
                        : ""}
            </p>
            ${stubCount > 0
                ? html`
                <label>
                    <input type="checkbox" .checked="${showStubs}"
                        @change="${({ target: { checked } }) => toggleStubs(checked)}">
                    Show ${stubCount} without a single note (markers only)
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
     * @param {import("../control/sequences.js").SequenceSummary} summary the sequence
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
                    @change="${() => this.choose(index)}">
                <strong>${name || `sequence ${index}`}</strong>
                ${isPlayable ? "" : html` <em>(no notes)</em>`}
                <br>
                ${loopBars > 0
                    ? html`<span class="numeric">loop ${decimal(loopBars, 0)} ${plural(Math.round(loopBars), {
                        one: "bar",
                        other: "bars"
                    })} / ${seconds(loopSeconds)}</span> · `
                    : html`<span class="numeric">${seconds(durationSeconds)}</span> · `}
                ${numerator}/${denominator} · <span class="numeric">${decimal(tempoBpm, 0)} BPM</span> ·
                ${plural(channels.length, { one: "channel", other: "channels" })}
                ${channels.join(", ") || "—"}${branchIndices.length > 0
                    ? html` · ${branchIndices.length} branch`
                    : ""}
            </label>
        </li>
        `;
    }
}

customElements.define("b-player-sequences", SequenceList);
