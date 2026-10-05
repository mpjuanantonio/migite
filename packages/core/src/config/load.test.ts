import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clavesApiAusentes } from "./apikeys.js";
import { ConfigError } from "./errors.js";
import { loadConfig } from "./load.js";

const APP_VALIDO = `rutas:
  vault: ./vault
  indice: ./data/index.db
zonaHoraria: Europe/Madrid
idioma: es
`;

const LLM_VALIDO = `proveedores:
  - id: openai
    baseUrl: https://api.openai.com/v1
    apiKeyEnv: OPENAI_API_KEY
roles:
  conversar: { proveedor: openai, modelo: gpt-4o-mini }
  recuperar: { proveedor: openai, modelo: gpt-4o-mini }
  resumir: { proveedor: openai, modelo: gpt-4o-mini }
  embeddings: { proveedor: openai, modelo: text-embedding-3-small }
`;

const raices: string[] = [];

const crearRoot = (ficheros: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "migite-config-"));
  raices.push(root);
  for (const [nombre, contenido] of Object.entries(ficheros)) {
    const ruta = join(root, nombre);
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, contenido, "utf8");
  }
  return root;
};

const capturarConfigError = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("se esperaba un ConfigError");
};

const conVars = (nombres: readonly string[], fn: () => void): void => {
  const originales = nombres.map((nombre) => [nombre, process.env[nombre]] as const);
  for (const nombre of nombres) {
    delete process.env[nombre];
  }
  try {
    fn();
  } finally {
    for (const [nombre, valor] of originales) {
      if (valor === undefined) {
        delete process.env[nombre];
      } else {
        process.env[nombre] = valor;
      }
    }
  }
};

afterEach(() => {
  for (const raiz of raices.splice(0)) {
    rmSync(raiz, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  describe("carga válida", () => {
    it("carga app.yaml y llm.yaml sin .env", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
      });

      const config = loadConfig({ root });

      expect(config.app.rutas).toEqual({ vault: "./vault", indice: "./data/index.db" });
      expect(config.app.zonaHoraria).toBe("Europe/Madrid");
      expect(config.app.idioma).toBe("es");
      expect(config.llm.proveedores).toHaveLength(1);
      expect(config.llm.proveedores[0]?.apiKeyEnv).toBe("OPENAI_API_KEY");
      expect(config.llm.roles.embeddings).toEqual({
        proveedor: "openai",
        modelo: "text-embedding-3-small",
      });
      expect(config.envVars).toEqual([]);
    });

    it("carga el .env opcional, lo aplica a process.env y solo devuelve nombres", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
        ".env": "# claves del proveedor\nOPENAI_API_KEY=sk-test-123\nPORT=3111\n",
      });

      conVars(["OPENAI_API_KEY", "PORT"], () => {
        const config = loadConfig({ root });

        expect(config.envVars).toEqual(["OPENAI_API_KEY", "PORT"]);
        expect(JSON.stringify(config)).not.toContain("sk-test-123");
        expect(process.env.OPENAI_API_KEY).toBe("sk-test-123");
        expect(process.env.PORT).toBe("3111");
      });
    });

    it("no pisa las variables ya presentes en el entorno", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
        ".env": "OPENAI_API_KEY=sk-del-shell\n",
      });

      conVars(["OPENAI_API_KEY"], () => {
        process.env.OPENAI_API_KEY = "sk-original";
        loadConfig({ root });
        expect(process.env.OPENAI_API_KEY).toBe("sk-original");
      });
    });

    it("acepta un baseUrl http, no solo https", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "baseUrl: https://api.openai.com/v1",
          "baseUrl: http://localhost:4000/v1",
        ),
      });

      const config = loadConfig({ root });

      expect(config.llm.proveedores[0]?.baseUrl).toBe("http://localhost:4000/v1");
    });

    it("arranca aunque falte la clave API y la reporta solo por nombre (RNF-071)", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
      });

      conVars(["OPENAI_API_KEY"], () => {
        const config = loadConfig({ root });

        expect(clavesApiAusentes(config.llm)).toEqual(["OPENAI_API_KEY"]);
      });
    });
  });

  describe("app.yaml inválido", () => {
    it("rechaza un idioma desconocido y localiza el campo", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO.replace("idioma: es", "idioma: fr"),
        "config/llm.yaml": LLM_VALIDO,
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.path).toBe("config/app.yaml");
      expect(error.message).toContain("config/app.yaml");
      expect(error.message).toContain("idioma");
    });

    it("rechaza una ruta vacía", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO.replace("vault: ./vault", 'vault: ""'),
        "config/llm.yaml": LLM_VALIDO,
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("rutas.vault");
      expect(error.message).toContain("no puede estar vacío");
    });

    it("rechaza una zona horaria que no es IANA", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO.replace("Europe/Madrid", "Marte/Olympus"),
        "config/llm.yaml": LLM_VALIDO,
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("zonaHoraria");
      expect(error.message).toContain("zona horaria IANA no reconocida");
    });

    it("rechaza claves no previstas en app.yaml", () => {
      const root = crearRoot({
        "config/app.yaml": `${APP_VALIDO}puerto: 8080\n`,
        "config/llm.yaml": LLM_VALIDO,
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("config/app.yaml");
      expect(error.message).toContain("puerto");
    });
  });

  describe("llm.yaml inválido", () => {
    it("rechaza un role que apunta a un proveedor inexistente", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "conversar: { proveedor: openai",
          "conversar: { proveedor: anthropic",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.path).toBe("config/llm.yaml");
      expect(error.message).toContain("roles.conversar.proveedor");
      expect(error.message).toContain("no está declarado en proveedores");
    });

    it("rechaza un role faltante", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "  resumir: { proveedor: openai, modelo: gpt-4o-mini }\n",
          "",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("roles.resumir");
    });

    it("rechaza ids de proveedor duplicados", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "    apiKeyEnv: OPENAI_API_KEY",
          "    apiKeyEnv: OPENAI_API_KEY\n  - id: openai\n    baseUrl: https://example.com/v1\n    apiKeyEnv: OTRO_API_KEY",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("proveedores.1.id");
      expect(error.message).toContain("id de proveedor duplicado");
    });

    it("rechaza un apiKeyEnv con formato inválido sin reflejar su valor", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "apiKeyEnv: OPENAI_API_KEY",
          "apiKeyEnv: sk-filtrado-123",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("proveedores.0.apiKeyEnv");
      expect(error.message).toContain("nombre de variable de entorno inválido");
      expect(error.message).not.toContain("sk-filtrado-123");
    });

    it("rechaza una clave API escrita dentro del YAML", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "    apiKeyEnv: OPENAI_API_KEY",
          "    apiKeyEnv: OPENAI_API_KEY\n    apiKey: sk-otro-secreto",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("apiKey");
      expect(error.message).not.toContain("sk-otro-secreto");
    });

    it("rechaza proveedores vacíos", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml":
          "proveedores: []\nroles:\n  conversar: { proveedor: openai, modelo: gpt-4o-mini }\n  recuperar: { proveedor: openai, modelo: gpt-4o-mini }\n  resumir: { proveedor: openai, modelo: gpt-4o-mini }\n  embeddings: { proveedor: openai, modelo: text-embedding-3-small }\n",
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("proveedores");
      expect(error.message).toContain("al menos un proveedor");
    });

    it("rechaza un baseUrl que no es una URL", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "baseUrl: https://api.openai.com/v1",
          "baseUrl: api.openai.com/v1",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("proveedores.0.baseUrl");
      expect(error.message).toContain("debe ser una URL http o https válida");
    });

    it("rechaza un baseUrl con protocolo distinto de http(s)", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO.replace(
          "baseUrl: https://api.openai.com/v1",
          "baseUrl: ftp://api.openai.com/v1",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("proveedores.0.baseUrl");
      expect(error.message).toContain("debe ser una URL http o https válida");
    });
  });

  describe("ficheros ausentes", () => {
    it("falla si falta config/app.yaml con el path en el mensaje", () => {
      const root = crearRoot({ "config/llm.yaml": LLM_VALIDO });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toBe(
        "Configuración inválida en config/app.yaml: fichero ausente o ilegible",
      );
    });

    it("falla si falta config/llm.yaml", () => {
      const root = crearRoot({ "config/app.yaml": APP_VALIDO });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.path).toBe("config/llm.yaml");
      expect(error.message).toContain("Configuración inválida en config/llm.yaml");
    });

    it("acepta un directorio raíz inexistente", () => {
      const root = join(tmpdir(), "migite-config-que-no-existe");

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("config/app.yaml");
    });
  });

  describe("mensajes de error", () => {
    it("usa la clave i18n error.configInvalida", () => {
      const root = crearRoot({ "config/llm.yaml": LLM_VALIDO });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error).toBeInstanceOf(ConfigError);
      expect(error.name).toBe("ConfigError");
      expect(error.message).toBe(
        "Configuración inválida en config/app.yaml: fichero ausente o ilegible",
      );
    });

    it("respeta la opción locale antes de leer app.yaml", () => {
      const root = crearRoot({ "config/llm.yaml": LLM_VALIDO });

      const error = capturarConfigError(() => loadConfig({ root, locale: "en" }));

      expect(error.message.startsWith("Invalid configuration in config/app.yaml")).toBe(true);
      expect(error.message).toContain("fichero ausente o ilegible");
    });

    it("usa el idioma de app.yaml para el error de llm.yaml", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO.replace("idioma: es", "idioma: en"),
        "config/llm.yaml": LLM_VALIDO.replace(
          "  resumir: { proveedor: openai, modelo: gpt-4o-mini }\n",
          "",
        ),
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message.startsWith("Invalid configuration in config/llm.yaml")).toBe(true);
    });

    it("reporta un error de sintaxis YAML por código y línea, sin volcar el contenido", () => {
      const root = crearRoot({
        "config/app.yaml":
          "rutas:\n  vault: ./vault\n   indice: ./data/index.db\nSECRETO: sk-filtrado-999\n",
        "config/llm.yaml": LLM_VALIDO,
      });

      const error = capturarConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("config/app.yaml");
      expect(error.message).toContain("sintaxis YAML inválida");
      expect(error.message).toContain("línea");
      expect(error.message).not.toContain("sk-filtrado-999");
      expect(error.message).not.toContain("./vault");
    });
  });

  describe(".env", () => {
    it("acepta un .env malformado como error claro sin volcar su contenido", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
        ".env": "sk-fila-sin-igual\nPORT=no-numero\n",
      });

      conVars(["PORT"], () => {
        const error = capturarConfigError(() => loadConfig({ root }));

        expect(error.path).toBe(".env");
        expect(error.message).toContain(".env");
        expect(error.message).toContain("línea 1");
        expect(error.message).toContain("línea 2");
        expect(error.message).not.toContain("sk-fila-sin-igual");
        expect(error.message).not.toContain("no-numero");
        expect(process.env.PORT).toBeUndefined();
      });
    });

    it("acepta comentarios y líneas en blanco", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
        ".env": "\n# solo comentarios\n\n",
      });

      const config = loadConfig({ root });

      expect(config.envVars).toEqual([]);
    });

    it("recorta el comentario inline de un valor sin comillas", () => {
      const root = crearRoot({
        "config/app.yaml": APP_VALIDO,
        "config/llm.yaml": LLM_VALIDO,
        ".env": "PORT=3000 # comentario de la linea\n",
      });

      conVars(["PORT"], () => {
        const config = loadConfig({ root });

        expect(config.envVars).toEqual(["PORT"]);
        expect(process.env.PORT).toBe("3000");
      });
    });
  });
});
