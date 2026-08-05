import { test, expect } from "@playwright/test";
import { buildXmi } from "../fixtures/build-xmi.js";

test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
});

test("the page renders the player panels", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "ss-mood-player", level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(/silnik nieuruchomiony/);
    await expect(page.getByLabel("Plik XMI")).toBeVisible();
});

test("starting the engine loads the worklet and reports readiness", async ({ page }) => {
    await page.getByRole("button", { name: "Uruchom silnik" }).click();
    await expect(page.getByRole("status")).toHaveText(/silnik gotowy/, { timeout: 15_000 });
    await expect(page.locator(".error")).toHaveCount(0);
});

test("picking an XMI file lists its sequences and branch points", async ({ page }) => {
    const file = buildXmi([
        {
            events: [
                { type: "trackName", text: "keeper" },
                { type: "branch", index: 0 },
                { type: "noteOn", channel: 3, note: 60, duration: 60 },
                { delta: 240, type: "branch", index: 5 },
                { delta: 240, type: "noteOn", channel: 3, note: 67, duration: 60 }
            ]
        },
        { timeSignature: [3, 4], events: [{ type: "noteOn", channel: 9, note: 48, duration: 30 }] },
        { events: [{ type: "marker", text: "theme1 SCMIDIfile" }] }
    ]);

    await page.getByLabel("Plik XMI").setInputFiles({
        name: "mood.xmi",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(file)
    });

    await expect(page.getByText("3 sekwencje w pliku")).toBeVisible();
    // The marker-only stub is hidden until asked for.
    await expect(page.getByRole("radio")).toHaveCount(2);
    await expect(page.getByText("keeper")).toBeVisible();
    await page.getByLabel("Pokaż 1 bez ani jednej nuty (same markery)").check();
    await expect(page.getByRole("radio")).toHaveCount(3);

    // Two branch marks, at ticks 0 and 240.
    await expect(page.getByRole("cell", { name: "240", exact: true })).toBeVisible();

    await page.getByRole("radio").nth(1).check();
    await expect(page.getByText("Brak punktów skoku", { exact: false })).toBeVisible();
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
