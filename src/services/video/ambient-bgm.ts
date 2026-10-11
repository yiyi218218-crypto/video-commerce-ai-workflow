import { writeFile } from "node:fs/promises";

/**
 * Produces a small, deterministic, royalty-free ambience bed for local drafts.
 * It is deliberately understated so narration remains the primary track.
 */
export async function writeAmbientBgm(
  file: string,
  durationSeconds = 15,
): Promise<void> {
  const sampleRate = 44_100;
  const frameCount = sampleRate * durationSeconds;
  const data = Buffer.alloc(frameCount * 2);
  const roots = [220, 261.63, 293.66, 246.94];
  const bpm = 96;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const beat = time * (bpm / 60);
    const beatIndex = Math.floor(beat) % roots.length;
    const beatPhase = beat - Math.floor(beat);
    const root = roots[beatIndex] ?? roots[0]!;
    const pulse = Math.exp(-beatPhase * 5.2);
    const pad =
      Math.sin(2 * Math.PI * root * time) * 0.07 +
      Math.sin(2 * Math.PI * root * 1.5 * time) * 0.04 +
      Math.sin(2 * Math.PI * root * 2 * time) * 0.025;
    const pluck = Math.sin(2 * Math.PI * root * 4 * time) * pulse * 0.055;
    const fade = Math.min(1, time / 0.6, (durationSeconds - time) / 0.8);
    const sample = Math.max(-1, Math.min(1, (pad + pluck) * fade));
    data.writeInt16LE(Math.round(sample * 32_767), frame * 2);
  }

  await writeFile(file, Buffer.concat([wavHeader(frameCount, sampleRate), data]));
}

function wavHeader(frameCount: number, sampleRate: number): Buffer {
  const dataLength = frameCount * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLength, 40);
  return header;
}
