import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IndexHandle, openIndex } from "@migite/index";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIndexSessionStore } from "./session-store.js";

let root: string;
let handle: IndexHandle;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "migite-session-store-"));
  handle = openIndex({ dbPath: join(root, "index.db") });
});

afterEach(() => {
  handle.close();
  rmSync(root, { recursive: true, force: true });
});

describe("createIndexSessionStore", () => {
  it("starts at generation zero", () => {
    expect(createIndexSessionStore(handle.db).generacion()).toBe(0);
  });

  it("increments the generation on every invalidation", () => {
    const store = createIndexSessionStore(handle.db);

    expect(store.invalidar()).toBe(1);
    expect(store.invalidar()).toBe(2);
    expect(store.generacion()).toBe(2);
  });

  it("persists the generation in the index meta table", () => {
    createIndexSessionStore(handle.db).invalidar();
    handle.close();
    handle = openIndex({ dbPath: join(root, "index.db") });

    expect(createIndexSessionStore(handle.db).generacion()).toBe(1);
  });
});
