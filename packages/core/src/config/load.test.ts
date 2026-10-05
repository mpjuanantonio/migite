import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { missingApiKeys } from "./apikeys.js";
import { ConfigError } from "./errors.js";
import { applyEnv, loadConfig } from "./load.js";

const VALID_APP = `paths:
  vault: ./vault
  index: ./data/index.db
timeZone: Europe/Madrid
locale: es
`;

const VALID_LLM = `providers:
  - id: openai
    baseUrl: https://api.openai.com/v1
    apiKeyEnv: OPENAI_API_KEY
roles:
  chat: { provider: openai, model: gpt-4o-mini }
  retrieve: { provider: openai, model: gpt-4o-mini }
  summarize: { provider: openai, model: gpt-4o-mini }
  embeddings: { provider: openai, model: text-embedding-3-small }
`;

const roots: string[] = [];

const createRoot = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "migite-config-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
  return root;
};

const captureConfigError = (fn: () => unknown): ConfigError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ConfigError");
};

const withVars = (names: readonly string[], fn: () => void): void => {
  const originals = names.map((name) => [name, process.env[name]] as const);
  for (const name of names) {
    delete process.env[name];
  }
  try {
    fn();
  } finally {
    for (const [name, value] of originals) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  describe("valid load", () => {
    it("loads app.yaml and llm.yaml without a .env", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
      });

      const config = loadConfig({ root });

      expect(config.app.paths).toEqual({ vault: "./vault", index: "./data/index.db" });
      expect(config.app.timeZone).toBe("Europe/Madrid");
      expect(config.app.locale).toBe("es");
      expect(config.llm.providers).toHaveLength(1);
      expect(config.llm.providers[0]?.apiKeyEnv).toBe("OPENAI_API_KEY");
      expect(config.llm.roles.embeddings).toEqual({
        provider: "openai",
        model: "text-embedding-3-small",
      });
      expect(config.envVars).toEqual([]);
    });

    it("loads an optional .env, applies it to process.env and returns only names", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
        ".env": "# provider keys\nOPENAI_API_KEY=sk-test-123\nPORT=3111\n",
      });

      withVars(["OPENAI_API_KEY", "PORT"], () => {
        const config = loadConfig({ root });

        expect(config.envVars).toEqual(["OPENAI_API_KEY", "PORT"]);
        expect(JSON.stringify(config)).not.toContain("sk-test-123");
        expect(process.env.OPENAI_API_KEY).toBe("sk-test-123");
        expect(process.env.PORT).toBe("3111");
      });
    });

    it("does not overwrite variables already present in the environment", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
        ".env": "OPENAI_API_KEY=sk-del-shell\n",
      });

      withVars(["OPENAI_API_KEY"], () => {
        process.env.OPENAI_API_KEY = "sk-original";
        loadConfig({ root });
        expect(process.env.OPENAI_API_KEY).toBe("sk-original");
      });
    });

    it("accepts an http baseUrl, not only https", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "baseUrl: https://api.openai.com/v1",
          "baseUrl: http://localhost:4000/v1",
        ),
      });

      const config = loadConfig({ root });

      expect(config.llm.providers[0]?.baseUrl).toBe("http://localhost:4000/v1");
    });

    it("starts even when the API key is missing and reports it by name only (RNF-071)", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
      });

      withVars(["OPENAI_API_KEY"], () => {
        const config = loadConfig({ root });

        expect(missingApiKeys(config.llm)).toEqual(["OPENAI_API_KEY"]);
      });
    });
  });

  describe("invalid app.yaml", () => {
    it("rejects an unknown locale and locates the field", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP.replace("locale: es", "locale: fr"),
        "config/llm.yaml": VALID_LLM,
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.path).toBe("config/app.yaml");
      expect(error.message).toContain("config/app.yaml");
      expect(error.message).toContain("locale");
    });

    it("rejects an empty path", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP.replace("vault: ./vault", 'vault: ""'),
        "config/llm.yaml": VALID_LLM,
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("paths.vault");
      expect(error.message).toContain("no puede estar vacío");
    });

    it("rejects a time zone that is not IANA", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP.replace("Europe/Madrid", "Mars/Olympus"),
        "config/llm.yaml": VALID_LLM,
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("timeZone");
      expect(error.message).toContain("zona horaria IANA no reconocida");
    });

    it("rejects unexpected keys in app.yaml", () => {
      const root = createRoot({
        "config/app.yaml": `${VALID_APP}port: 8080\n`,
        "config/llm.yaml": VALID_LLM,
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("config/app.yaml");
      expect(error.message).toContain("port");
    });
  });

  describe("invalid llm.yaml", () => {
    it("rejects a role pointing at an undeclared provider", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "chat: { provider: openai",
          "chat: { provider: anthropic",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.path).toBe("config/llm.yaml");
      expect(error.message).toContain("roles.chat.provider");
      expect(error.message).toContain("no está declarado en proveedores");
    });

    it("rejects a missing role", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "  summarize: { provider: openai, model: gpt-4o-mini }\n",
          "",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("roles.summarize");
    });

    it("rejects duplicated provider ids", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "    apiKeyEnv: OPENAI_API_KEY",
          "    apiKeyEnv: OPENAI_API_KEY\n  - id: openai\n    baseUrl: https://example.com/v1\n    apiKeyEnv: OTHER_API_KEY",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("providers.1.id");
      expect(error.message).toContain("id de proveedor duplicado");
    });

    it("rejects an apiKeyEnv with an invalid format without reflecting its value", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "apiKeyEnv: OPENAI_API_KEY",
          "apiKeyEnv: sk-filtrado-123",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("providers.0.apiKeyEnv");
      expect(error.message).toContain("nombre de variable de entorno inválido");
      expect(error.message).not.toContain("sk-filtrado-123");
    });

    it("rejects an API key written inside the YAML", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "    apiKeyEnv: OPENAI_API_KEY",
          "    apiKeyEnv: OPENAI_API_KEY\n    apiKey: sk-otro-secreto",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("apiKey");
      expect(error.message).not.toContain("sk-otro-secreto");
    });

    it("rejects empty providers", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml":
          "providers: []\nroles:\n  chat: { provider: openai, model: gpt-4o-mini }\n  retrieve: { provider: openai, model: gpt-4o-mini }\n  summarize: { provider: openai, model: gpt-4o-mini }\n  embeddings: { provider: openai, model: text-embedding-3-small }\n",
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("providers");
      expect(error.message).toContain("al menos un proveedor");
    });

    it("rejects a baseUrl that is not a URL", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "baseUrl: https://api.openai.com/v1",
          "baseUrl: api.openai.com/v1",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("providers.0.baseUrl");
      expect(error.message).toContain("debe ser una URL http o https válida");
    });

    it("rejects a baseUrl with a protocol other than http(s)", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM.replace(
          "baseUrl: https://api.openai.com/v1",
          "baseUrl: ftp://api.openai.com/v1",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("providers.0.baseUrl");
      expect(error.message).toContain("debe ser una URL http o https válida");
    });
  });

  describe("missing files", () => {
    it("fails when config/app.yaml is missing, with the path in the message", () => {
      const root = createRoot({ "config/llm.yaml": VALID_LLM });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toBe(
        "Configuración inválida en config/app.yaml: fichero ausente o ilegible",
      );
    });

    it("fails when config/llm.yaml is missing", () => {
      const root = createRoot({ "config/app.yaml": VALID_APP });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.path).toBe("config/llm.yaml");
      expect(error.message).toContain("Configuración inválida en config/llm.yaml");
    });

    it("accepts a root directory that does not exist", () => {
      const root = join(tmpdir(), "migite-config-that-does-not-exist");

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("config/app.yaml");
    });
  });

  describe("error messages", () => {
    it("uses the error.invalidConfig i18n key", () => {
      const root = createRoot({ "config/llm.yaml": VALID_LLM });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error).toBeInstanceOf(ConfigError);
      expect(error.name).toBe("ConfigError");
      expect(error.message).toBe(
        "Configuración inválida en config/app.yaml: fichero ausente o ilegible",
      );
    });

    it("honors the locale option before reading app.yaml", () => {
      const root = createRoot({ "config/llm.yaml": VALID_LLM });

      const error = captureConfigError(() => loadConfig({ root, locale: "en" }));

      expect(error.message.startsWith("Invalid configuration in config/app.yaml")).toBe(true);
      expect(error.message).toContain("fichero ausente o ilegible");
    });

    it("uses the locale of app.yaml for the llm.yaml error", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP.replace("locale: es", "locale: en"),
        "config/llm.yaml": VALID_LLM.replace(
          "  summarize: { provider: openai, model: gpt-4o-mini }\n",
          "",
        ),
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message.startsWith("Invalid configuration in config/llm.yaml")).toBe(true);
    });

    it("reports app.yaml issues in the requested locale", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP.replace("vault: ./vault", 'vault: ""'),
        "config/llm.yaml": VALID_LLM,
      });

      const error = captureConfigError(() => loadConfig({ root, locale: "en" }));

      expect(error.message).toContain("Invalid configuration in config/app.yaml");
      expect(error.message).toContain("paths.vault");
      expect(error.message).toContain("must not be empty");
      expect(error.message).not.toContain("no puede estar vacío");
    });

    it("reports llm.yaml issues in the locale declared by app.yaml", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP.replace("locale: es", "locale: en"),
        "config/llm.yaml":
          "providers: []\nroles:\n  chat: { provider: openai, model: gpt-4o-mini }\n  retrieve: { provider: openai, model: gpt-4o-mini }\n  summarize: { provider: openai, model: gpt-4o-mini }\n  embeddings: { provider: openai, model: text-embedding-3-small }\n",
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("Invalid configuration in config/llm.yaml");
      expect(error.message).toContain("must declare at least one provider");
      expect(error.message).not.toContain("debe declarar al menos un proveedor");
    });

    it("reports a YAML syntax error by code and line, without dumping the content", () => {
      const root = createRoot({
        "config/app.yaml":
          "paths:\n  vault: ./vault\n   index: ./data/index.db\nSECRETO: sk-filtrado-999\n",
        "config/llm.yaml": VALID_LLM,
      });

      const error = captureConfigError(() => loadConfig({ root }));

      expect(error.message).toContain("config/app.yaml");
      expect(error.message).toContain("sintaxis YAML inválida");
      expect(error.message).toContain("línea");
      expect(error.message).not.toContain("sk-filtrado-999");
      expect(error.message).not.toContain("./vault");
    });
  });

  describe(".env", () => {
    it("accepts a malformed .env as a clear error without dumping its content", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
        ".env": "line-without-equals\nPORT=not-a-number\n",
      });

      withVars(["PORT"], () => {
        const error = captureConfigError(() => loadConfig({ root }));

        expect(error.path).toBe(".env");
        expect(error.message).toContain(".env");
        expect(error.message).toContain("línea 1");
        expect(error.message).toContain("línea 2");
        expect(error.message).not.toContain("line-without-equals");
        expect(error.message).not.toContain("not-a-number");
        expect(process.env.PORT).toBeUndefined();
      });
    });

    it("accepts comments and blank lines", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
        ".env": "\n# comments only\n\n",
      });

      const config = loadConfig({ root });

      expect(config.envVars).toEqual([]);
    });

    it("trims the inline comment of an unquoted value", () => {
      const root = createRoot({
        "config/app.yaml": VALID_APP,
        "config/llm.yaml": VALID_LLM,
        ".env": "PORT=3000 # inline comment\n",
      });

      withVars(["PORT"], () => {
        const config = loadConfig({ root });

        expect(config.envVars).toEqual(["PORT"]);
        expect(process.env.PORT).toBe("3000");
      });
    });
  });
});

describe("applyEnv", () => {
  it("writes into the injected target keeping the values already present", () => {
    const target: NodeJS.ProcessEnv = { OPENAI_API_KEY: "del-shell" };

    applyEnv(
      [
        { name: "OPENAI_API_KEY", value: "del-fichero", line: 1 },
        { name: "NUEVA", value: "nueva", line: 2 },
      ],
      target,
    );

    expect(target).toEqual({ OPENAI_API_KEY: "del-shell", NUEVA: "nueva" });
  });

  it("defaults the target to process.env", () => {
    withVars(["MIGITE_APPLY_ENV"], () => {
      applyEnv([{ name: "MIGITE_APPLY_ENV", value: "1", line: 1 }]);

      expect(process.env.MIGITE_APPLY_ENV).toBe("1");
    });
  });
});
