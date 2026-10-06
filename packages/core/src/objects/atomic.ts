import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

let sequence = 0;

export const removeFileQuietly = (path: string): void => {
  try {
    unlinkSync(path);
  } catch {}
};

export const writeTempFile = (dir: string, text: string): string => {
  const temp = join(dir, `.migite-${process.pid}-${sequence++}.tmp`);
  try {
    const fd = openSync(temp, "wx");
    try {
      writeSync(fd, text, null, "utf8");
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
  const temp = writeTempFile(dirname(path), text);
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
