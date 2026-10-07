import { describe, expect, it } from "vitest";
import { sanitizeZipName } from "./zip.js";

describe("sanitizeZipName", () => {
  it("normaliza los separadores de Windows", () => {
    expect(sanitizeZipName("carpeta\\nota.md")).toBe("carpeta/nota.md");
    expect(sanitizeZipName("carpeta\\sub\\nota.md")).toBe("carpeta/sub/nota.md");
  });

  it("mantiene los nombres relativos válidos", () => {
    expect(sanitizeZipName("nota.md")).toBe("nota.md");
    expect(sanitizeZipName("carpeta/nota.md")).toBe("carpeta/nota.md");
  });

  it("rechaza rutas con traversal", () => {
    expect(sanitizeZipName("../secreto.md")).toBeUndefined();
    expect(sanitizeZipName("carpeta/../../secreto.md")).toBeUndefined();
    expect(sanitizeZipName("..\\..\\secreto.md")).toBeUndefined();
    expect(sanitizeZipName("..")).toBeUndefined();
  });

  it("rechaza rutas absolutas", () => {
    expect(sanitizeZipName("/etc/passwd")).toBeUndefined();
    expect(sanitizeZipName("\\\\servidor\\recurso\\nota.md")).toBeUndefined();
    expect(sanitizeZipName("C:\\nota.md")).toBeUndefined();
  });

  it("rechaza caracteres de control", () => {
    expect(sanitizeZipName("nota\nrara.md")).toBeUndefined();
    expect(sanitizeZipName("nota\u0000.md")).toBeUndefined();
    expect(sanitizeZipName("nota\u007f.md")).toBeUndefined();
  });

  it("rechaza nombres vacíos o con segmentos vacíos", () => {
    expect(sanitizeZipName("")).toBeUndefined();
    expect(sanitizeZipName("carpeta//nota.md")).toBeUndefined();
    expect(sanitizeZipName("carpeta/")).toBeUndefined();
    expect(sanitizeZipName("/")).toBeUndefined();
  });
});
