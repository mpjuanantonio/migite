import { describe, expect, it } from "vitest";
import { parseDotenv, problemasDeEnv } from "./env.js";

describe("parseDotenv", () => {
  it("recorta el comentario de los valores sin comillas", () => {
    const { entries, issues } = parseDotenv("PORT=3000 # comentario de la linea\n");

    expect(issues).toEqual([]);
    expect(entries).toEqual([{ name: "PORT", value: "3000", line: 1 }]);
  });

  it("recorta el comentario aunque el valor lleve espacios o tabuladores delante", () => {
    const { entries } = parseDotenv("CLAVE=sk-1   # comentario\nOTRA=sk-2\t# tabulado\n");

    expect(entries.map((entry) => entry.value)).toEqual(["sk-1", "sk-2"]);
  });

  it("recorta el comentario cuando solo hay espacios tras el igual", () => {
    const { entries } = parseDotenv("VACIA= # solo comentario\n");

    expect(entries).toEqual([{ name: "VACIA", value: "", line: 1 }]);
  });

  it("conserva el comentario dentro de los valores comillados", () => {
    const { entries } = parseDotenv('CLAVE="sk-1 # no es comentario"\n');

    expect(entries).toEqual([{ name: "CLAVE", value: "sk-1 # no es comentario", line: 1 }]);
  });

  it("conserva el almohadillado cuando no va precedido de espacio", () => {
    const { entries } = parseDotenv("URL=https://ejemplo.com/#/ruta\n");

    expect(entries).toEqual([{ name: "URL", value: "https://ejemplo.com/#/ruta", line: 1 }]);
  });

  it("no convierte un PORT con comentario en un valor invalido", () => {
    const { entries, issues } = parseDotenv("PORT=3000 # sirve para el server\n");

    expect(issues).toEqual([]);
    expect(problemasDeEnv(entries)).toEqual([]);
  });
});
