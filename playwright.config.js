import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

export default defineConfig({
    testDir: "tests/e2e",
    reporter: process.env.CI ? "list" : "line",
    use: {
        baseURL: `http://localhost:${PORT}`,
        ...devices["Desktop Chrome"],
        // The full Chromium build rather than the headless shell: this project renders audio.
        channel: "chromium",
        launchOptions: {
            // Playwright mutes audio by default and blocks an AudioContext without a gesture.
            ignoreDefaultArgs: ["--mute-audio"],
            args: ["--autoplay-policy=no-user-gesture-required"]
        }
    },
    webServer: {
        // zws prints a HeadlessException after start because it cannot open a browser here;
        // the file server itself keeps running, which is all the tests need.
        command: `java --source 25 .claude/skills/web-conventions/scripts/zws app/src`,
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
    }
});
