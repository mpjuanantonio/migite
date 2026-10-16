import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("construye el prompt en español por defecto con el rol y las reglas", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("asistente de Migite");
    expect(prompt).toContain("mismo idioma");
    expect(prompt).toContain("de qué fichero o título");
    expect(prompt).toContain("confirmación explícita");
    expect(prompt).toContain("Nunca apliques escrituras directamente");
    expect(prompt.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(4);
  });

  it("construye el prompt en inglés cuando se pide", () => {
    const prompt = buildSystemPrompt({ locale: "en" });

    expect(prompt).toContain("Migite assistant");
    expect(prompt).toContain("same language");
    expect(prompt).not.toContain("asistente de Migite");
    expect(prompt).not.toBe(buildSystemPrompt({ locale: "es" }));
  });
});
