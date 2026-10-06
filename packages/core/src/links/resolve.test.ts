import { describe, expect, it } from "vitest";
import { findUnresolvedWikiLinks, resolveWikiLink, type TitleResolver } from "./resolve.js";
import { parseWikiLinks, type WikiLink } from "./wikilink.js";

const firstLink = (text: string): WikiLink => {
  const link = parseWikiLinks(text)[0];
  if (link === undefined) {
    throw new Error(`expected a wikilink in "${text}"`);
  }
  return link;
};

const resolve: TitleResolver = (title) =>
  title.trim().toLowerCase() === "existe" ? { id: "01", path: "existe.md" } : undefined;

describe("resolveWikiLink", () => {
  it("resolves a title through the injected resolver", () => {
    expect(resolveWikiLink(firstLink("[[Existe|alias]]"), resolve)).toEqual({
      id: "01",
      path: "existe.md",
    });
  });

  it("returns undefined for an unknown or empty title", () => {
    expect(resolveWikiLink(firstLink("[[No existe]]"), resolve)).toBeUndefined();
    expect(resolveWikiLink(firstLink("[[#ancla]]"), resolve)).toBeUndefined();
  });
});

describe("findUnresolvedWikiLinks", () => {
  it("returns only the links the resolver cannot resolve", () => {
    expect(findUnresolvedWikiLinks("[[Existe]] [[Falta]]", resolve)).toEqual([
      { raw: "[[Falta]]", title: "Falta" },
    ]);
  });

  it("keeps alias and heading in the raw value", () => {
    expect(findUnresolvedWikiLinks("[[Falta#ancla|alias]]", resolve)).toEqual([
      { raw: "[[Falta#ancla|alias]]", title: "Falta" },
    ]);
  });

  it("ignores links without a title", () => {
    expect(findUnresolvedWikiLinks("[[#ancla]] [[ ]]", resolve)).toEqual([]);
  });
});
