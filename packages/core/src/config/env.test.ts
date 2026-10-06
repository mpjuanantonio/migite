import { describe, expect, it } from "vitest";
import { envIssues, parseDotenv } from "./env.js";

describe("parseDotenv", () => {
  it("strips comments from unquoted values", () => {
    const { entries, issues } = parseDotenv("PORT=3000 # inline comment\n");

    expect(issues).toEqual([]);
    expect(entries).toEqual([{ name: "PORT", value: "3000", line: 1 }]);
  });

  it("strips the comment even when the value is prefixed by spaces or tabs", () => {
    const { entries } = parseDotenv("KEY=sk-1   # comment\nOTHER=sk-2\t# tab\n");

    expect(entries.map((entry) => entry.value)).toEqual(["sk-1", "sk-2"]);
  });

  it("strips the comment when only spaces follow the equals sign", () => {
    const { entries } = parseDotenv("EMPTY= # comment only\n");

    expect(entries).toEqual([{ name: "EMPTY", value: "", line: 1 }]);
  });

  it("keeps the comment inside quoted values", () => {
    const { entries } = parseDotenv('KEY="sk-1 # not a comment"\n');

    expect(entries).toEqual([{ name: "KEY", value: "sk-1 # not a comment", line: 1 }]);
  });

  it("keeps hash fragments that are not preceded by a space", () => {
    const { entries } = parseDotenv("URL=https://example.com/#/route\n");

    expect(entries).toEqual([{ name: "URL", value: "https://example.com/#/route", line: 1 }]);
  });

  it("does not turn a commented PORT into an invalid value", () => {
    const { entries, issues } = parseDotenv("PORT=3000 # used by the server\n");

    expect(issues).toEqual([]);
    expect(envIssues(entries)).toEqual([]);
  });
});
