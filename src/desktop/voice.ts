import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import type { Settings } from "./shared.js";

export async function transcribeLocally(
  audio: ArrayBuffer,
  voice: Settings["voice"],
  signal: AbortSignal,
): Promise<string> {
  if (
    !(audio instanceof ArrayBuffer) ||
    audio.byteLength < 1 ||
    audio.byteLength > 15_000_000
  )
    throw new Error(
      "Recording must be between 1 byte and 15 MB. Please record a shorter idea.",
    );
  if (!voice.modelPath)
    throw new Error(
      "Set up local dictation in Settings first: select whisper-cli, ffmpeg, and a Whisper model.",
    );
  await access(voice.modelPath).catch(() => {
    throw new Error(
      "The selected Whisper model could not be found. Choose it again in Settings.",
    );
  });
  const directory = await mkdtemp(path.join(os.tmpdir(), "saasfactory-voice-"));
  try {
    const input = path.join(directory, "capture.webm");
    const wav = path.join(directory, "capture.wav");
    const output = path.join(directory, "transcript");
    await writeFile(input, Buffer.from(audio), { mode: 0o600 });
    await execa(
      voice.ffmpegPath,
      [
        "-nostdin",
        "-y",
        "-i",
        input,
        "-t",
        "120",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        wav,
      ],
      { timeout: 30000, cancelSignal: signal },
    );
    await execa(
      voice.whisperPath,
      [
        "-m",
        voice.modelPath,
        "-f",
        wav,
        "-l",
        "auto",
        "-otxt",
        "-of",
        output,
        "-nt",
      ],
      { timeout: 180000, cancelSignal: signal },
    );
    const text = (await readFile(`${output}.txt`, "utf8")).trim();
    if (!text)
      throw new Error(
        "No speech was detected. Try again closer to the microphone.",
      );
    return text;
  } catch (error) {
    if (error instanceof Error && /ENOENT/.test(error.message))
      throw new Error(
        "Local dictation tools were not found. Check their paths in Settings.",
      );
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
