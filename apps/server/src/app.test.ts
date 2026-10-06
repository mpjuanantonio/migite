import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("GET /api/health", () => {
  it("returns the system status", async () => {
    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
