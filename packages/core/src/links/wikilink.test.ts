import { describe, expect, it } from "vitest";
import { normalizeTitle, parseWikiLinks, rewriteWikiLinks } from "./wikilink.js";

describe("normalizeTitle", () => {
  it("trims and lowercases the title", () => {
    expect(normalizeTitle("  Llamar al Banco  ")).toBe("llamar al banco");
  });
});

describe("parseWikiLinks", () => {
  it("parses a plain wikilink with its raw text and index", () => {
    expect(parseWikiLinks("ver [[Presupuesto 2026]] ya")).toEqual([
      { title: "Presupuesto 2026", raw: "[[Presupuesto 2026]]", index: 4 },
    ]);
  });

  it("parses alias, heading and both combined", () => {
    expect(parseWikiLinks("[[T|alias]] [[T#ancla]] [[T#ancla|alias]]")).toEqual([
      { title: "T", alias: "alias", raw: "[[T|alias]]", index: 0 },
      { title: "T", heading: "ancla", raw: "[[T#ancla]]", index: 12 },
      { title: "T", heading: "ancla", alias: "alias", raw: "[[T#ancla|alias]]", index: 24 },
    ]);
  });

  it("trims every part of the wikilink", () => {
    expect(parseWikiLinks("[[ T # ancla | alias ]]")).toEqual([
      { title: "T", heading: "ancla", alias: "alias", raw: "[[ T # ancla | alias ]]", index: 0 },
    ]);
  });

  it("returns an empty list when there are no wikilinks", () => {
    expect(parseWikiLinks("solo texto [normal](url)")).toEqual([]);
  });

  it("keeps an empty title for markup like [[ ]]", () => {
    expect(parseWikiLinks("[[ ]]")).toEqual([{ title: "", raw: "[[ ]]", index: 0 }]);
  });

  it("parses links across multiple lines", () => {
    expect(parseWikiLinks("[[Uno]]\n[[Dos]]").map((link) => link.title)).toEqual(["Uno", "Dos"]);
  });
});

describe("rewriteWikiLinks", () => {
  it("rewrites body links, aliases and headings, preserving them", () => {
    expect(
      rewriteWikiLinks(
        "ver [[viejo]] y [[viejo|alias]] y [[viejo#ancla]] y [[viejo#ancla|alias]]",
        "Viejo",
        "Nuevo",
      ),
    ).toBe("ver [[Nuevo]] y [[Nuevo|alias]] y [[Nuevo#ancla]] y [[Nuevo#ancla|alias]]");
  });

  it("matches titles case-insensitively and with surrounding spaces", () => {
    expect(rewriteWikiLinks("[[  VIEJO ]]", "viejo", "Nuevo")).toBe("[[Nuevo]]");
  });

  it("rewrites every occurrence and leaves other titles untouched", () => {
    expect(rewriteWikiLinks("[[Viejo]] [[Otro]] [[Viejo]]", "Viejo", "Nuevo")).toBe(
      "[[Nuevo]] [[Otro]] [[Nuevo]]",
    );
  });

  it("updates the casing when only the title casing changes", () => {
    expect(rewriteWikiLinks("[[viejo]]", "Viejo", "VIEJO")).toBe("[[VIEJO]]");
  });

  it("trims the new title", () => {
    expect(rewriteWikiLinks("[[Viejo]]", "Viejo", "  Nuevo  ")).toBe("[[Nuevo]]");
  });

  it("does not rewrite when the old title is empty", () => {
    expect(rewriteWikiLinks("[[ ]] [[Viejo]]", "   ", "Nuevo")).toBe("[[ ]] [[Viejo]]");
  });

  it("does not rewrite when the new title is empty", () => {
    expect(rewriteWikiLinks("[[Viejo]]", "Viejo", "   ")).toBe("[[Viejo]]");
  });

  it("ignores wikilinks without a title", () => {
    expect(rewriteWikiLinks("[[#ancla]]", "Viejo", "Nuevo")).toBe("[[#ancla]]");
  });
});
