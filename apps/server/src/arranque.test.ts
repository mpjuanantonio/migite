import type { Config } from "@migite/core";
import { describe, expect, it } from "vitest";
import { avisosDeArranque, mensajeDeErrorDeServidor, resolverPuerto } from "./arranque.js";

const configConClave = (apiKeyEnv: string, idioma: "es" | "en" = "es"): Config => ({
  app: {
    rutas: { vault: "./vault", indice: "./data/index.db" },
    zonaHoraria: "Europe/Madrid",
    idioma,
  },
  llm: {
    proveedores: [{ id: "openai", baseUrl: "https://api.openai.com/v1", apiKeyEnv }],
    roles: {
      conversar: { proveedor: "openai", modelo: "gpt-4o-mini" },
      recuperar: { proveedor: "openai", modelo: "gpt-4o-mini" },
      resumir: { proveedor: "openai", modelo: "gpt-4o-mini" },
      embeddings: { proveedor: "openai", modelo: "text-embedding-3-small" },
    },
  },
  envVars: [],
});

describe("resolverPuerto", () => {
  it("usa 3000 si PORT no está definido", () => {
    expect(resolverPuerto(undefined)).toBe(3000);
  });

  it("acepta un entero dentro del rango", () => {
    expect(resolverPuerto("3000")).toBe(3000);
    expect(resolverPuerto("1")).toBe(1);
    expect(resolverPuerto("65535")).toBe(65535);
    expect(resolverPuerto(" 4000 ")).toBe(4000);
  });

  it("rechaza un valor no numérico con un error claro", () => {
    expect(() => resolverPuerto("abc")).toThrow("PORT inválido");
    expect(() => resolverPuerto("abc")).toThrow("entre 1 y 65535");
  });

  it("rechaza un valor vacío en lugar de abrir un puerto aleatorio", () => {
    expect(() => resolverPuerto("")).toThrow("PORT inválido");
  });

  it("rechaza enteros fuera del rango o no enteros", () => {
    expect(() => resolverPuerto("0")).toThrow("PORT inválido");
    expect(() => resolverPuerto("65536")).toThrow("PORT inválido");
    expect(() => resolverPuerto("8080.5")).toThrow("PORT inválido");
    expect(() => resolverPuerto("-1")).toThrow("PORT inválido");
  });
});

describe("mensajeDeErrorDeServidor", () => {
  it("traduce EADDRINUSE a un mensaje claro sin stack", () => {
    const error = Object.assign(new Error("listen EADDRINUSE: address in use :::3000"), {
      code: "EADDRINUSE",
    });

    const mensaje = mensajeDeErrorDeServidor(error);

    expect(mensaje).toBe("No se pudo iniciar el servidor: el puerto ya está en uso (EADDRINUSE)");
    expect(mensaje).not.toContain("\n");
  });

  it("describe EACCES con un mensaje claro", () => {
    const error = Object.assign(new Error("listen EACCES: permission denied"), { code: "EACCES" });

    expect(mensajeDeErrorDeServidor(error)).toBe(
      "No se pudo iniciar el servidor: no hay permisos para escuchar en el puerto (EACCES)",
    );
  });

  it("usa el mensaje del error si el código no está contemplado", () => {
    expect(mensajeDeErrorDeServidor(new Error("fallo cualquiera"))).toBe(
      "No se pudo iniciar el servidor: fallo cualquiera",
    );
    expect(mensajeDeErrorDeServidor("fallo raro")).toBe(
      "No se pudo iniciar el servidor: fallo raro",
    );
  });
});

describe("avisosDeArranque", () => {
  it("avisa por el nombre de la variable cuando falta la clave API", () => {
    const avisos = avisosDeArranque(configConClave("OPENAI_API_KEY"), {});

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain("OPENAI_API_KEY");
    expect(avisos[0]).toContain("agente de IA");
  });

  it("no emite aviso si la clave está definida", () => {
    const avisos = avisosDeArranque(configConClave("OPENAI_API_KEY"), {
      OPENAI_API_KEY: "sk-secreto",
    });

    expect(avisos).toEqual([]);
  });

  it("nunca refleja valores del entorno en el aviso", () => {
    const avisos = avisosDeArranque(configConClave("OPENAI_API_KEY"), {
      OTRA_VAR: "sk-otro-secreto",
    });

    expect(avisos.join(" ")).toContain("OPENAI_API_KEY");
    expect(avisos.join(" ")).not.toContain("sk-otro-secreto");
  });

  it("localiza el aviso según el idioma de la configuración", () => {
    const enIngles = avisosDeArranque(configConClave("OPENAI_API_KEY", "en"), {});

    expect(enIngles[0]).toContain("Warning");
    expect(enIngles[0]).toContain("OPENAI_API_KEY");
  });
});
