import { describe, expect, it } from "vitest";
import {
  chunkMarkdownBySections,
  DEFAULT_CHUNK_MAX_CHARS,
  DEFAULT_CHUNK_OVERLAP_CHARS,
} from "./chunks.js";

describe("chunkMarkdownBySections", () => {
  it("exports default limits", () => {
    expect(DEFAULT_CHUNK_MAX_CHARS).toBe(1500);
    expect(DEFAULT_CHUNK_OVERLAP_CHARS).toBe(150);
  });

  it("chunks a note without headings into a single chunk with null heading", () => {
    const body = "Primer párrafo de la nota.\n\nSegundo párrafo con más detalle.";
    const chunks = chunkMarkdownBySections(body, "Mi nota");

    expect(chunks).toEqual([
      {
        heading: null,
        text: "Primer párrafo de la nota.\n\nSegundo párrafo con más detalle.",
        order: 0,
      },
    ]);
  });

  it("splits markdown by ATX headings (# to ######) and keeps pre-heading text with null heading", () => {
    const body = [
      "Texto introductorio antes de cualquier sección.",
      "",
      "# Contexto",
      "Contenido del contexto inicial.",
      "",
      "## Objetivos ##",
      "Lista de objetivos principales.",
      "",
      "### Detalles técnicos",
      "Especificación detallada del módulo.",
    ].join("\n");

    const chunks = chunkMarkdownBySections(body, "Documento");

    expect(chunks).toEqual([
      {
        heading: null,
        text: "Texto introductorio antes de cualquier sección.",
        order: 0,
      },
      {
        heading: "Contexto",
        text: "Contenido del contexto inicial.",
        order: 1,
      },
      {
        heading: "Objetivos",
        text: "Lista de objetivos principales.",
        order: 2,
      },
      {
        heading: "Detalles técnicos",
        text: "Especificación detallada del módulo.",
        order: 3,
      },
    ]);
  });

  it("ignores # lines inside fenced code blocks (``` and ~~~)", () => {
    const body = [
      "# Instalación",
      "Ejecuta los siguientes comandos:",
      "",
      "```bash",
      "# Este comentario no es un encabezado",
      "pnpm install",
      "## Tampoco este",
      "```",
      "",
      "~~~python",
      "# Comentario en bloque tilde",
      "print('hola')",
      "~~~",
      "",
      "Texto final de instalación.",
      "",
      "## Uso",
      "Instrucciones de uso.",
    ].join("\n");

    const chunks = chunkMarkdownBySections(body);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      heading: "Instalación",
      text: [
        "Ejecuta los siguientes comandos:",
        "",
        "```bash",
        "# Este comentario no es un encabezado",
        "pnpm install",
        "## Tampoco este",
        "```",
        "",
        "~~~python",
        "# Comentario en bloque tilde",
        "print('hola')",
        "~~~",
        "",
        "Texto final de instalación.",
      ].join("\n"),
      order: 0,
    });
    expect(chunks[1]).toEqual({
      heading: "Uso",
      text: "Instrucciones de uso.",
      order: 1,
    });
  });

  it("splits oversized sections respecting maxChars and overlapChars while preserving heading and sequential order", () => {
    const p1 = "Alfa beta gamma delta epsilon zeta eta theta iota kappa lambda mu.";
    const p2 = "Nu xi omicron pi rho sigma tau upsilon phi chi psi omega fin.";
    const p3 = "Uno dos tres cuatro cinco seis siete ocho nueve diez once doce.";
    const body = [
      "# Resumen corto",
      "Breve introducción.",
      "",
      "# Sección extensa",
      p1,
      "",
      p2,
      "",
      p3,
      "",
      "## Cierre",
      "Conclusión final.",
    ].join("\n");

    const maxChars = 90;
    const overlapChars = 20;
    const chunks = chunkMarkdownBySections(body, "Nota larga", { maxChars, overlapChars });

    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks.map((c) => c.order)).toEqual(chunks.map((_, idx) => idx));
    expect(chunks[0]).toEqual({
      heading: "Resumen corto",
      text: "Breve introducción.",
      order: 0,
    });
    expect(chunks.at(-1)?.heading).toBe("Cierre");
    expect(chunks.at(-1)?.text).toBe("Conclusión final.");

    const longSectionChunks = chunks.filter((c) => c.heading === "Sección extensa");
    expect(longSectionChunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of longSectionChunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(maxChars);
    }
    const firstLong = longSectionChunks[0]?.text ?? "";
    const secondLong = longSectionChunks[1]?.text ?? "";
    const firstTailWords = firstLong.split(/\s+/).slice(-2).join(" ");
    expect(secondLong).toContain(firstTailWords);
  });

  it("falls back to title when body is empty or whitespace-only, and returns [] when both are empty", () => {
    expect(chunkMarkdownBySections("", "Comprar leche")).toEqual([
      {
        heading: null,
        text: "Comprar leche",
        order: 0,
      },
    ]);
    expect(chunkMarkdownBySections("   \n\t  ", "  Llamar al médico  ")).toEqual([
      {
        heading: null,
        text: "Llamar al médico",
        order: 0,
      },
    ]);
    expect(chunkMarkdownBySections("", "")).toEqual([]);
    expect(chunkMarkdownBySections("   ", "   ")).toEqual([]);
    expect(chunkMarkdownBySections("")).toEqual([]);
  });
});
