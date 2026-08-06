import { test, expect } from "@playwright/test";
import { buildXmi } from "../fixtures/build-xmi.js";
import { buildChunkTable, buildScoreTables } from "../fixtures/build-score.js";

/** Two four-bar modules and a marker-only stub, the shape a System Shock theme file has. */
const THEME = buildXmi([
    { events: [{ type: "marker", text: "theme1 SCMIDIfile" }] },
    {
        events: [
            { type: "trackName", text: "keeper" },
            { type: "loopStart" },
            { type: "programChange", channel: 10, program: 29 },
            { type: "noteOn", channel: 10, note: 57, velocity: 110, duration: 12 },
            { delta: 240, type: "loopEnd" }
        ]
    },
    {
        events: [
            { type: "loopStart" },
            { type: "programChange", channel: 10, program: 29 },
            { type: "noteOn", channel: 10, note: 52, velocity: 110, duration: 12 },
            { delta: 240, type: "loopEnd" }
        ]
    }
]);

/** Score 0 cycles superchunks 0 and 1, which are XMI sequences 1 and 2. */
const TABLES = buildScoreTables({ scores: { 0: [0, 1, 0, 1] }, keys: { 0: [1, 1], 1: [5, 5] } });
const CHUNKS = buildChunkTable({ 0: { bars: 4, channels: [10] }, 1: { bars: 4, channels: [10] } });

/**
 * @param {import("@playwright/test").Page} page the page under test
 * @param {{withTables: boolean}} options whether to supply the score tables too
 * @returns {Promise<void>}
 */
const pickTheme = async (page, { withTables }) => {
    const files = [{ name: "THM1.XMI", mimeType: "application/octet-stream", buffer: Buffer.from(THEME) }];
    if (withTables) {
        files.push({ name: "THM1.BIN", mimeType: "application/octet-stream", buffer: Buffer.from(TABLES) });
        files.push({ name: "THM1.DAT", mimeType: "application/octet-stream", buffer: Buffer.from(CHUNKS) });
    }
    await page.getByLabel(/Theme files/).setInputFiles(files);
};

test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
});

test("the page renders the player panels", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "ss-mood-player", level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(/engine not started/);
    await expect(page.getByLabel(/Theme files/)).toBeVisible();
});

test("starting the engine loads the worklet and reports readiness", async ({ page }) => {
    await page.getByRole("button", { name: "Start engine" }).click();
    await expect(page.getByRole("status")).toHaveText(/engine ready/, { timeout: 15_000 });
    await expect(page.locator(".error")).toHaveCount(0);
});

test("an XMI without its score tables is listed but refuses to play", async ({ page }) => {
    await pickTheme(page, { withTables: false });

    await expect(page.getByText("3 sequences in the file")).toBeVisible();
    await expect(page.getByText("keeper")).toBeVisible();
    // The player says what is missing and why, instead of playing something unfaithful.
    await expect(page.getByText("Load the score tables", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play score" })).toBeDisabled();
});

test("with the score tables the theme's intensity levels appear", async ({ page }) => {
    await pickTheme(page, { withTables: true });

    await expect(page.getByRole("group", { name: /Score/ })).toBeVisible();
    // Superchunks 0 and 1 are sequences 1 and 2, in keys 1 and 5.
    await expect(page.getByText("1 → 2 → 1 → 2")).toBeVisible();
    await expect(page.getByText("keys 1,5,1,5")).toBeVisible();
});

test("plays a score's cycle through the worklet and moves between modules", async ({ page }) => {
    await page.getByRole("button", { name: "Start engine" }).click();
    // The bank is several megabytes; the status only reports presets once it has loaded.
    await expect(page.getByRole("status")).toContainText("presets", { timeout: 60_000 });

    await pickTheme(page, { withTables: true });
    await page.getByLabel(/Loop a single module/).uncheck();
    await page.getByRole("button", { name: "Play score" }).click();

    // The transport only advances if the audio graph is actually pulling the worklet.
    await expect
        .poll(async () => {
            const text = await page.getByText(/^Position:/).textContent();
            return Number(text?.match(/tick\s+(\d+)/)?.[1] ?? 0);
        }, { timeout: 15_000, message: "the position tick never advanced" })
        .toBeGreaterThan(0);
    // Each module is 240 ticks, so within a few seconds the cycle must have moved on.
    await expect(page.getByText("switched", { exact: false }).first())
        .toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".error")).toHaveCount(0);
});

test("the vendored synthesizer renders finite samples through OfflineAudioContext", async ({ page }) => {
    const rendered = await page.evaluate(async () => {
        const { SpessaSynthProcessor } = await import("/libs/spessasynth_core.js");
        const context = new OfflineAudioContext({ numberOfChannels: 2, length: 4_096, sampleRate: 48_000 });
        const synth = new SpessaSynthProcessor(context.sampleRate, { eventsEnabled: false });
        await synth.processorInitialized;

        const left = new Float32Array(128);
        const right = new Float32Array(128);
        synth.process(left, right);
        const buffer = await context.startRendering();

        return {
            sampleRate: synth.sampleRate,
            finite: left.every(Number.isFinite) && right.every(Number.isFinite),
            renderedLength: buffer.length
        };
    });

    expect(rendered).toEqual({ sampleRate: 48_000, finite: true, renderedLength: 4_096 });
});
