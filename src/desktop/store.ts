import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LibrarySchema, emptyLibrary, type Library } from "./shared.js";

/** Single writer, atomic replacement, and fail-closed reads keep captures durable. */
export class LibraryStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly file: string) {}

  async read(): Promise<Library> {
    await this.queue.catch(() => {});
    return this.load();
  }

  private async load(): Promise<Library> {
    let content: string;
    try {
      content = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyLibrary();
      throw error;
    }
    try {
      return LibrarySchema.parse(JSON.parse(content));
    } catch {
      throw new Error(
        `Your idea library could not be read. The original file is untouched: ${this.file}. Restore a backup to a separate location before recovering it.`,
      );
    }
  }

  update<T>(change: (state: Library) => T): Promise<T> {
    const operation = this.queue
      .catch(() => {})
      .then(async () => {
        const state = await this.load();
        const result = change(state);
        const valid = LibrarySchema.parse(state);
        await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(valid, null, 2), {
          mode: 0o600,
          flush: true,
        });
        await rename(temporary, this.file);
        return result;
      });
    this.queue = operation;
    return operation;
  }

  async recover(): Promise<void> {
    await this.update((state) => {
      for (const run of state.runs)
        if (run.status === "running") {
          run.status = "interrupted";
          run.finishedAt = new Date().toISOString();
          run.message =
            "The app closed before this check finished. Run it again when ready.";
        }
    });
  }
}
