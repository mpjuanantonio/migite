import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapVault,
  createObjectRepository,
  type DomainEvent,
  type ObjectRepository,
} from "./index.js";

type EventsSetup = {
  vaultDir: string;
  events: DomainEvent[];
  repo: ObjectRepository;
};

const roots: string[] = [];

const setup = (onEvent?: (event: DomainEvent) => void): EventsSetup => {
  const vaultDir = mkdtempSync(join(tmpdir(), "migite-events-"));
  roots.push(vaultDir);
  bootstrapVault(vaultDir);
  const events: DomainEvent[] = [];
  const repo = createObjectRepository({
    vaultDir,
    timeZone: "Europe/Madrid",
    onEvent: (event) => {
      events.push(event);
      onEvent?.(event);
    },
  });
  return { vaultDir, events, repo };
};

const captureError = (action: () => unknown): Error => {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an error");
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("domain events", () => {
  it("emits ObjectCreated with the new id and path", () => {
    const { events, repo } = setup();

    const created = repo.createObject({ title: "Primera nota", type: "nota" });

    expect(events).toEqual([{ type: "ObjectCreated", objectId: created.id, path: created.path }]);
  });

  it("emits ObjectUpdated with the same path on update", () => {
    const { events, repo } = setup();
    const created = repo.createObject({ title: "Nota editable", type: "nota" });
    events.length = 0;

    const updated = repo.updateObject(created.id, { body: "contenido nuevo" });

    expect(updated.path).toBe(created.path);
    expect(events).toEqual([{ type: "ObjectUpdated", objectId: created.id, path: created.path }]);
  });

  it("emits ObjectUpdated with the new path on rename", () => {
    const { events, repo } = setup();
    const created = repo.createObject({ title: "Titulo viejo", type: "nota" });
    events.length = 0;

    const report = repo.renameObject(created.id, "Titulo nuevo");

    expect(report.object.path).not.toBe(created.path);
    expect(report.object.path.endsWith("titulo-nuevo.md")).toBe(true);
    expect(events).toEqual([
      { type: "ObjectUpdated", objectId: created.id, path: report.object.path },
    ]);
  });

  it("emits ObjectUpdated with the new path on move", () => {
    const { events, repo } = setup();
    const created = repo.createObject({ title: "Nota movible", type: "nota" });
    events.length = 0;

    const moved = repo.moveObject(created.id, "archivo");

    expect(moved.path.startsWith("archivo/")).toBe(true);
    expect(events).toEqual([{ type: "ObjectUpdated", objectId: created.id, path: moved.path }]);
  });

  it("emits ObjectDeleted with id and path", () => {
    const { events, repo } = setup();
    const created = repo.createObject({ title: "Nota borrable", type: "nota" });
    events.length = 0;

    repo.deleteObject(created.id);

    expect(events).toEqual([{ type: "ObjectDeleted", objectId: created.id, path: created.path }]);
  });

  it("does not emit when a rename is a no-op", () => {
    const { events, repo } = setup();
    const created = repo.createObject({ title: "Mismo titulo", type: "nota" });
    events.length = 0;

    const report = repo.renameObject(created.id, "Mismo titulo");

    expect(report.object.path).toBe(created.path);
    expect(events).toEqual([]);
  });

  it("does not emit when an operation fails", () => {
    const { events, repo } = setup();
    const created = repo.createObject({ title: "Nota intacta", type: "nota" });
    events.length = 0;

    expect(() => repo.updateObject(created.id, { title: "Otro titulo" })).toThrow();
    expect(() => repo.createObject({ title: "   " })).toThrow();
    captureError(() => repo.deleteObject("01J8XK2P4R5S6T7U8V9W0X1Y2Z"));

    expect(events).toEqual([]);
  });

  it("forwards events to an external listener", () => {
    const received: DomainEvent[] = [];
    const { repo } = setup((event) => received.push(event));

    const created = repo.createObject({ title: "Nota observada", type: "nota" });

    expect(received).toEqual([{ type: "ObjectCreated", objectId: created.id, path: created.path }]);
  });
});
