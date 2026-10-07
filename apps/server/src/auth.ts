import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ConfigError, defaultLocale, type Locale } from "@migite/core";
import { verify } from "@node-rs/argon2";

export const SESSION_COOKIE = "migite_session";
export const SESSION_GENERATION_KEY = "session_generation";
export const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const TOKEN_VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const MIN_SECRET_DISTINCT_CHARS = 16;
const ARGON2_PREFIX = "$argon2";

export type SessionStore = {
  readonly generacion: () => number;
  readonly invalidar: () => number;
};

export type AuthConfig = {
  readonly usuario: string;
  readonly passwordHash: string;
  readonly secretoSesion: string;
};

export type AuthOptions = AuthConfig & {
  readonly store: SessionStore;
  readonly ttlMs?: number;
};

export type SessionTokenPayload = {
  readonly usuario: string;
  readonly generacion: number;
  readonly expiraEn: number;
};

export type Credentials = {
  readonly usuario: string;
  readonly contrasena: string;
};

export type CreateSessionTokenOptions = {
  readonly usuario: string;
  readonly generacion: number;
  readonly secret: string;
  readonly ttlMs?: number;
  readonly now?: number;
};

export type VerifySessionTokenOptions = {
  readonly secret: string;
  readonly generacion: number;
  readonly usuario: string;
  readonly now?: number;
};

const constantTimeEqual = (a: string, b: string): boolean => {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
};

const isRepeatedPattern = (value: string): boolean => {
  for (let size = 1; size <= value.length / 2; size += 1) {
    if (value.length % size === 0 && value.slice(size) === value.slice(0, value.length - size)) {
      return true;
    }
  }
  return false;
};

const secretIssue = (secret: string): string | undefined => {
  if (secret.length < MIN_SECRET_LENGTH) {
    return `MIGITE_SESSION_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres`;
  }
  if (new Set(secret).size < MIN_SECRET_DISTINCT_CHARS) {
    return `MIGITE_SESSION_SECRET debe tener al menos ${MIN_SECRET_DISTINCT_CHARS} caracteres distintos`;
  }
  if (isRepeatedPattern(secret)) {
    return "MIGITE_SESSION_SECRET no puede ser un patrón repetido";
  }
  return undefined;
};

const sign = (secret: string, value: string): string =>
  createHmac("sha256", secret).update(value, "utf8").digest("base64url");

const encodePayload = (payload: SessionTokenPayload): string =>
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

const decodePayload = (value: string): SessionTokenPayload | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const { usuario, generacion, expiraEn } = parsed as Record<string, unknown>;
  if (typeof usuario !== "string" || usuario.length === 0) {
    return undefined;
  }
  if (typeof generacion !== "number" || !Number.isSafeInteger(generacion) || generacion < 0) {
    return undefined;
  }
  if (typeof expiraEn !== "number" || !Number.isFinite(expiraEn)) {
    return undefined;
  }
  return { usuario, generacion, expiraEn };
};

export const createSessionToken = (options: CreateSessionTokenOptions): string => {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const payload = encodePayload({
    usuario: options.usuario,
    generacion: options.generacion,
    expiraEn: now + ttlMs,
  });
  const body = `${TOKEN_VERSION}.${payload}`;
  return `${body}.${sign(options.secret, body)}`;
};

export const verifySessionToken = (
  token: string | undefined,
  options: VerifySessionTokenOptions,
): SessionTokenPayload | undefined => {
  if (token === undefined) {
    return undefined;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  const [version, encoded, signature] = parts;
  if (version !== TOKEN_VERSION || encoded === undefined || encoded.length === 0) {
    return undefined;
  }
  if (signature === undefined) {
    return undefined;
  }
  if (!constantTimeEqual(signature, sign(options.secret, `${version}.${encoded}`))) {
    return undefined;
  }
  const payload = decodePayload(encoded);
  if (payload === undefined) {
    return undefined;
  }
  if (payload.expiraEn <= (options.now ?? Date.now())) {
    return undefined;
  }
  if (payload.generacion !== options.generacion) {
    return undefined;
  }
  if (!constantTimeEqual(payload.usuario, options.usuario)) {
    return undefined;
  }
  return payload;
};

export const loadAuthConfig = (
  locale: Locale = defaultLocale,
  env: Readonly<Record<string, string | undefined>> = process.env,
): AuthConfig => {
  const issues: string[] = [];

  const usuario = env.MIGITE_USER?.trim() ?? "";
  if (usuario.length === 0) {
    issues.push("MIGITE_USER no está definido");
  }

  const passwordHash = env.MIGITE_PASSWORD_HASH?.trim() ?? "";
  if (passwordHash.length === 0) {
    issues.push("MIGITE_PASSWORD_HASH no está definido");
  } else if (!passwordHash.startsWith(ARGON2_PREFIX)) {
    issues.push("MIGITE_PASSWORD_HASH no es un hash argon2 válido");
  }

  const secretoSesion = env.MIGITE_SESSION_SECRET ?? "";
  const issueSecreto = secretIssue(secretoSesion);
  if (issueSecreto !== undefined) {
    issues.push(issueSecreto);
  }

  if (issues.length > 0) {
    throw new ConfigError(".env", issues, locale);
  }

  return { usuario, passwordHash, secretoSesion };
};

export const verifyCredentials = async (
  auth: Pick<AuthOptions, "usuario" | "passwordHash">,
  credentials: Credentials,
): Promise<boolean> => {
  const usuarioCorrecto = constantTimeEqual(credentials.usuario, auth.usuario);
  let contrasenaCorrecta = false;
  try {
    contrasenaCorrecta = await verify(auth.passwordHash, credentials.contrasena);
  } catch {
    contrasenaCorrecta = false;
  }
  return usuarioCorrecto && contrasenaCorrecta;
};
