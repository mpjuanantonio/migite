import { type Config, missingApiKeys, type TranslationKey, t } from "@migite/core";

const DEFAULT_PORT = 3000;
const PORT_PATTERN = /^\d+$/;

const LISTEN_ERROR_KEYS: Readonly<Record<string, TranslationKey>> = {
  EADDRINUSE: "error.portInUse",
  EACCES: "error.portPermissionDenied",
  EADDRNOTAVAIL: "error.portUnavailable",
};

export const resolvePort = (value: string | undefined): number => {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const text = value.trim();
  const number = PORT_PATTERN.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(number) || number < 1 || number > 65535) {
    throw new Error(t("error.invalidPort", { value: text, defaultValue: DEFAULT_PORT }));
  }
  return number;
};

const errorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
};

const errorDetail = (error: unknown): string => {
  const code = errorCode(error);
  if (code !== undefined) {
    const known = LISTEN_ERROR_KEYS[code];
    if (known !== undefined) {
      return t(known);
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const serverErrorMessage = (error: unknown): string =>
  t("error.serverStartFailed", { detail: errorDetail(error) });

export const startupWarnings = (
  config: Config,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] =>
  missingApiKeys(config.llm, env).map((variable) =>
    t("warning.missingApiKey", { variable }, config.app.locale),
  );
