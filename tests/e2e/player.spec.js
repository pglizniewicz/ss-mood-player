import { test, expect } from "@playwright/test";

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
