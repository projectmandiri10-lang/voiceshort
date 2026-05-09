import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function stripUtf8Bom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

export class JsonFile<T> {
  private chain: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly filePath: string,
    private readonly fallback: T
  ) {}

  private async readRaw(): Promise<T> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      try {
        return JSON.parse(stripUtf8Bom(raw)) as T;
      } catch (error) {
        throw new Error(
          `File JSON tidak valid di ${this.filePath}: ${
            (error as { message?: string })?.message || "format JSON rusak"
          }`
        );
      }
    } catch (error) {
      const readError = error as NodeJS.ErrnoException;
      if (readError.code === "ENOENT") {
        return this.fallback;
      }
      throw new Error(
        `Gagal membaca file ${this.filePath}: ${
          readError.message || "error filesystem tidak diketahui"
        }`
      );
    }
  }

  private async writeRaw(data: T): Promise<void> {
    const directory = path.dirname(this.filePath);
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;

    await mkdir(directory, { recursive: true });
    try {
      await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
      await this.renameWithRetry(tempPath, this.filePath);
    } catch (error) {
      throw new Error(
        `Gagal menulis file ${this.filePath}: ${
          (error as { message?: string })?.message || "error filesystem tidak diketahui"
        }`
      );
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  public async get(): Promise<T> {
    return this.withLock(() => this.readRaw());
  }

  public async set(data: T): Promise<void> {
    return this.withLock(() => this.writeRaw(data));
  }

  public async update(updater: (current: T) => T | Promise<T>): Promise<T> {
    return this.withLock(async () => {
      const current = await this.readRaw();
      const next = await updater(current);
      await this.writeRaw(next);
      return next;
    });
  }

  private async withLock<R>(fn: () => Promise<R>): Promise<R> {
    const previous = this.chain;
    let unlock!: () => void;
    this.chain = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    await previous;
    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  private async renameWithRetry(fromPath: string, toPath: string): Promise<void> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await rename(fromPath, toPath);
        return;
      } catch (error) {
        if (attempt >= maxAttempts || !isTransientRenameError(error)) {
          throw error;
        }
        await delay(20 * attempt);
      }
    }
  }
}
