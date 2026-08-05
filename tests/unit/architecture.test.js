import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const SOURCE_ROOT = new URL("../../app/src/", import.meta.url);
const WEB_AUDIO_NAMES = ["AudioContext", "AudioWorklet", "OfflineAudioContext", "audioWorklet"];

/**
 * @param {URL} directory directory to walk
 * @returns {Promise<string[]>} paths of every JavaScript file below it, relative to app/src
 */
const javaScriptFiles = async directory => {
    const entries = await readdir(directory, { withFileTypes: true, recursive: true });
    return entries
        .filter(entry => entry.isFile() && entry.name.endsWith(".js"))
        .map(entry => `${entry.parentPath}/${entry.name}`.replace(SOURCE_ROOT.pathname, ""));
};

const innerLayers = async () => {
    const files = await javaScriptFiles(SOURCE_ROOT);
    return files.filter(path => path.includes("/control/") || path.includes("/entity/"));
};

test("control and entity never reach into boundary", async () => {
    const files = await innerLayers();
    assert.ok(files.length > 0, "expected control and entity modules to exist");

    for (const path of files) {
        const source = await readFile(new URL(path, SOURCE_ROOT), "utf8");
        assert.ok(
            !source.includes("boundary/"),
            `${path} imports from boundary — the dependency direction is boundary → control → entity`
        );
    }
});

test("control and entity never touch Web Audio", async () => {
    const files = await innerLayers();

    for (const path of files) {
        const source = await readFile(new URL(path, SOURCE_ROOT), "utf8");
        const used = WEB_AUDIO_NAMES.filter(name => source.includes(name));
        assert.deepEqual(
            used,
            [],
            `${path} references ${used.join(", ")} — Web Audio belongs to boundary so these layers stay runnable under node --test`
        );
    }
});
