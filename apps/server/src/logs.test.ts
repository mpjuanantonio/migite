import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "./env.js";
import { createRequestId, writeLog } from "./logs.js";
import { requestLogger } from "./middleware/logs.js";

const parseLine = (line: unknown): Record<string, unknown> => JSON.parse(String(line));

describe("createRequestId", () => {
  it("returns a short hex identifier", () => {
    expect(createRequestId()).toMatch(/^[0-9a-f]{8}$/);
    expect(createRequestId()).not.toBe(createRequestId());
  });
});

describe("writeLog", () => {
  it("serializes one json line per entry", () => {
    const lines: string[] = [];

    writeLog(
      {
        event: "request",
        requestId: "abcd1234",
        method: "GET",
        path: "/api/health",
        status: 200,
        durationMs: 7,
      },
      (line) => lines.push(line),
    );

    expect(lines).toHaveLength(1);
    expect(parseLine(lines[0] ?? "")).toEqual({
      event: "request",
      requestId: "abcd1234",
      method: "GET",
      path: "/api/health",
      status: 200,
      durationMs: 7,
    });
  });
});

describe("requestLogger", () => {
  it("logs method, path, status, duration and request id after each request", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Hono<ServerEnv>();
    app.use("*", requestLogger);
    app.get("/ping", (c) => c.json({ ok: true }));

    const res = await app.request("/ping?token=secreto");

    expect(res.status).toBe(200);
    const entry = parseLine(log.mock.calls.at(-1)?.[0]);
    expect(entry.event).toBe("request");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/ping");
    expect(entry.status).toBe(200);
    expect(entry.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof entry.durationMs).toBe("number");
    expect(JSON.stringify(entry)).not.toContain("secreto");
  });
});
