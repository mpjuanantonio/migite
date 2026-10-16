import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  LIMITE_CONTENIDO_MEMORIA_PROMPT,
  LIMITE_MEMORIAS_PROMPT,
} from "./prompt.js";

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

  it("no añade la sección de memoria cuando no hay memorias", () => {
    const prompt = buildSystemPrompt({ memorias: [] });

    expect(prompt).not.toContain("Memoria aprobada");
    expect(prompt).toBe(buildSystemPrompt());
  });

  it("incluye las memorias aprobadas con su clave y contenido", () => {
    const prompt = buildSystemPrompt({
      memorias: [
        { clave: "color favorito", contenido: "azul" },
        { clave: "ciudad", contenido: "linea uno\nlinea dos" },
      ],
    });

    expect(prompt).toContain("Memoria aprobada por la persona usuaria:");
    expect(prompt).toContain("- color favorito: azul");
    expect(prompt).toContain("- ciudad: linea uno linea dos");
  });

  it("usa el título de memoria en inglés", () => {
    const prompt = buildSystemPrompt({
      locale: "en",
      memorias: [{ clave: "colour", contenido: "blue" }],
    });

    expect(prompt).toContain("Memory approved by the user:");
    expect(prompt).toContain("- colour: blue");
    expect(prompt).not.toContain("Memoria aprobada por la persona usuaria:");
  });

  it("limita el número de memorias y recorta el contenido largo", () => {
    const memorias = Array.from({ length: LIMITE_MEMORIAS_PROMPT + 1 }, (_, index) => ({
      clave: `clave-${index}`,
      contenido: index === 0 ? "x".repeat(LIMITE_CONTENIDO_MEMORIA_PROMPT + 50) : `valor-${index}`,
    }));

    const prompt = buildSystemPrompt({ memorias });

    expect(prompt).toContain("- clave-0: " + "x".repeat(LIMITE_CONTENIDO_MEMORIA_PROMPT) + "…");
    expect(prompt).toContain(`- clave-${LIMITE_MEMORIAS_PROMPT - 1}:`);
    expect(prompt).not.toContain(`- clave-${LIMITE_MEMORIAS_PROMPT}:`);
  });
});
