import {
  closeSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

let sequence = 0;

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;

const existingMode = (path: string): number | undefined => {
  try {
    return statSync(path).mode & 0o777;
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

export const removeFileQuietly = (path: string): void => {
  try {
    unlinkSync(path);
  } catch {}
};

export const writeTempFile = (dir: string, text: string, mode?: number): string => {
  const temp = join(dir, `.migite-${process.pid}-${sequence++}.tmp`);
  try {
    const fd = openSync(temp, "wx");
    try {
      writeSync(fd, text, null, "utf8");
      if (mode !== undefined) {
        fchmodSync(fd, mode);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return temp;
  } catch (error) {
    removeFileQuietly(temp);
    throw error;
  }
};

export const writeFileAtomic = (path: string, text: string): void => {
  const temp = writeTempFile(dirname(path), text, existingMode(path));
  try {
    renameSync(temp, path);
  } finally {
    removeFileQuietly(temp);
  }
};

export const createFileExclusive = (path: string, text: string): void => {
  const temp = writeTempFile(dirname(path), text);
  try {
    linkSync(temp, path);
  } finally {
    removeFileQuietly(temp);
  }
};
