import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeAmbientBgm } from "../../src/services/video/ambient-bgm.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("writeAmbientBgm", () => {
  it("writes a deterministic PCM WAV bed with the requested duration", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-bgm-"));
    directories.push(directory);
    const file = path.join(directory, "bed.wav");

    await writeAmbientBgm(file, 2);

    const buffer = await readFile(file);
    expect(buffer.subarray(0, 4).toString()).toBe("RIFF");
    expect(buffer.subarray(8, 12).toString()).toBe("WAVE");
    expect(buffer.readUInt32LE(40)).toBe(44_100 * 2 * 2);
  });
});
