import { describe, expect, it, vi } from "vitest";
import { isUlid, newUlid } from "./ulid.js";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]+$/;

describe("newUlid", () => {
  it("generates 26 char Crockford base32 identifiers", () => {
    const ulid = newUlid();

    expect(ulid).toHaveLength(26);
    expect(ulid).toMatch(CROCKFORD);
    expect(ulid.charAt(0) <= "7").toBe(true);
    expect(isUlid(ulid)).toBe(true);
  });

  it("stays monotonic within the same millisecond", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    try {
      const first = newUlid();
      const second = newUlid();
      const third = newUlid();

      expect(first < second).toBe(true);
      expect(second < third).toBe(true);
      expect(new Set([first, second, third]).size).toBe(3);
    } finally {
      now.mockRestore();
    }
  });

  it("sorts by generation time", () => {
    const past = vi.spyOn(Date, "now").mockReturnValue(1_600_000_000_000);
    let older: string;
    try {
      older = newUlid();
    } finally {
      past.mockRestore();
    }
    const newer = newUlid();

    expect(older < newer).toBe(true);
    expect(newer.slice(0, 10) >= older.slice(0, 10)).toBe(true);
  });

  it("keeps a large sample unique and ordered", () => {
    const ulids = Array.from({ length: 10_000 }, () => newUlid());

    expect(new Set(ulids).size).toBe(10_000);
    expect(ulids).toEqual([...ulids].sort());
  });
});

describe("isUlid", () => {
  it("accepts canonical identifiers", () => {
    expect(isUlid("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(true);
    expect(isUlid(newUlid())).toBe(true);
  });

  it("rejects anything outside the format", () => {
    expect(isUlid("")).toBe(false);
    expect(isUlid("01J8XK2P4R5S6T7U8V9W0X1Y2")).toBe(false);
    expect(isUlid("01J8XK2P4R5S6T7U8V9W0X1Y2Z0")).toBe(false);
    expect(isUlid("81J8XK2P4R5S6T7U8V9W0X1Y2Z")).toBe(false);
    expect(isUlid("01J8IK2P4R5S6T7U8V9W0X1Y2Z")).toBe(false);
    expect(isUlid("01J8LK2P4R5S6T7U8V9W0X1Y2Z")).toBe(false);
    expect(isUlid("01J8XK2P4R5S6T7U8V9W0X1Y2z")).toBe(false);
    expect(isUlid(42)).toBe(false);
    expect(isUlid(null)).toBe(false);
    expect(isUlid(undefined)).toBe(false);
  });
});
