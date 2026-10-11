import { spawn } from "node:child_process";

import { VcaError } from "../../errors.js";

export interface SpeechSynthesizer {
  synthesize(textFile: string, outputFile: string): Promise<void>;
}

export class WindowsSpeechSynthesizer implements SpeechSynthesizer {
  constructor(private readonly scriptFile: string) {}

  async synthesize(
    textFile: string,
    outputFile: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          this.scriptFile,
          "-InputFile",
          textFile,
          "-OutputFile",
          outputFile,
        ],
        {
          shell: false,
          stdio: ["ignore", "ignore", "pipe"],
          windowsHide: true,
        },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-4_000);
      });
      child.once("error", (error) => {
        reject(
          new VcaError(
            "VIDEO_TTS_START_FAILED",
            "Could not start the Windows speech synthesizer.",
            undefined,
            { cause: error },
          ),
        );
      });
      child.once("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new VcaError(
            "VIDEO_TTS_FAILED",
            `Windows speech synthesis failed with exit code ${code ?? "unknown"}.`,
            stderr || undefined,
          ),
        );
      });
    });
  }
}
