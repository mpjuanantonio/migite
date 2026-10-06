import { errorBodySchema } from "@migite/contracts";
import {
  ConfigError,
  defaultLocale,
  type Locale,
  locales,
  ObjectOperationError,
  type TranslationKey,
  TypeOperationError,
  t,
} from "@migite/core";
import { IndexError } from "@migite/index";
import type { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ServerEnv } from "../env.js";
import { createRequestId, writeLog } from "../logs.js";

export type ErrorCode =
  | "ambiguous_title"
  | "attribute_type_immutable"
  | "bad_request"
  | "config_error"
  | "confirmation_required"
  | "conflict"
  | "forbidden"
  | "index_error"
  | "internal_error"
  | "invalid_object_write"
  | "missing_required_attribute"
  | "not_found"
  | "object_not_found"
  | "reserved_attribute_key"
  | "type_already_exists"
  | "type_not_editable"
  | "type_not_found"
  | "unauthorized"
  | "validation_error";

const CODE_STATUS: Readonly<Record<ErrorCode, ContentfulStatusCode>> = {
  ambiguous_title: 409,
  attribute_type_immutable: 422,
  bad_request: 400,
  config_error: 500,
  confirmation_required: 409,
  conflict: 409,
  forbidden: 403,
  index_error: 500,
  internal_error: 500,
  invalid_object_write: 422,
  missing_required_attribute: 422,
  not_found: 404,
  object_not_found: 404,
  reserved_attribute_key: 422,
  type_already_exists: 409,
  type_not_editable: 403,
  type_not_found: 404,
  unauthorized: 401,
  validation_error: 400,
};

const OBJECT_ERROR_CODES: Readonly<Partial<Record<TranslationKey, ErrorCode>>> = {
  "error.ambiguousTitle": "ambiguous_title",
  "error.confirmationRequired": "confirmation_required",
  "error.invalidObjectWrite": "invalid_object_write",
  "error.missingRequiredAttribute": "missing_required_attribute",
  "error.objectNotFound": "object_not_found",
  "error.reservedAttributeKey": "reserved_attribute_key",
};

const TYPE_ERROR_CODES: Readonly<Partial<Record<TranslationKey, ErrorCode>>> = {
  "error.attributeTypeImmutable": "attribute_type_immutable",
  "error.notFound": "type_not_found",
  "error.typeAlreadyExists": "type_already_exists",
  "error.typeNotEditable": "type_not_editable",
  "error.validationError": "validation_error",
};

const CODE_MESSAGES: Readonly<Partial<Record<ErrorCode, TranslationKey>>> = {
  bad_request: "error.badRequest",
  confirmation_required: "error.confirmationRequired",
  conflict: "error.conflict",
  forbidden: "error.forbidden",
  index_error: "error.indexError",
  internal_error: "error.internalError",
  not_found: "error.notFound",
  unauthorized: "error.unauthorized",
  validation_error: "error.validationError",
};

const HTTP_ERROR_CODES: Readonly<Partial<Record<number, ErrorCode>>> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "validation_error",
};

const MAX_DETAIL_LENGTH = 300;

const isLocale = (value: string): value is Locale => locales.some((locale) => locale === value);

export const resolveLocale = (
  header: string | undefined,
  fallback: Locale = defaultLocale,
): Locale => {
  if (header === undefined) {
    return fallback;
  }
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (tag === undefined || tag.length === 0) {
      continue;
    }
    const primary = tag.split("-")[0];
    if (primary !== undefined && isLocale(primary)) {
      return primary;
    }
  }
  return fallback;
};

type ValidationIssue = {
  readonly message: string;
  readonly path?: readonly unknown[];
};

type ZodLikeError = {
  readonly issues: readonly unknown[];
};

const field = (value: unknown, key: string): unknown => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
};

const isZodError = (error: unknown): error is ZodLikeError =>
  field(error, "name") === "ZodError" && Array.isArray(field(error, "issues"));

const isValidationIssue = (value: unknown): value is ValidationIssue => {
  const path = field(value, "path");
  return typeof field(value, "message") === "string" && (path === undefined || Array.isArray(path));
};

const pathText = (path: readonly unknown[] | undefined): string => {
  if (path === undefined) {
    return "";
  }
  const segments: string[] = [];
  for (const segment of path) {
    if (typeof segment === "string" || typeof segment === "number") {
      segments.push(String(segment));
    }
  }
  return segments.join(".");
};

const issueText = (issue: ValidationIssue): string => {
  const location = pathText(issue.path);
  return location.length === 0 ? issue.message : `${location}: ${issue.message}`;
};

const validationDetail = (issues: readonly unknown[]): string => {
  const parts: string[] = [];
  for (const issue of issues) {
    if (parts.length >= 5) {
      break;
    }
    if (isValidationIssue(issue)) {
      const text = issueText(issue).trim();
      if (text.length > 0) {
        parts.push(text);
      }
    }
  }
  const detail = parts.join("; ");
  return detail.length > MAX_DETAIL_LENGTH ? `${detail.slice(0, MAX_DETAIL_LENGTH)}...` : detail;
};

type ApiError = {
  readonly codigo: ErrorCode;
  readonly status: ContentfulStatusCode;
  readonly mensaje: string;
  readonly detalle: string;
  readonly stack?: string;
};

const internalMessage = (error: Error): string => {
  const name = error.name.trim().length > 0 ? error.name.trim() : "Error";
  const message = error.message.trim();
  return message.length > 0 ? `${name}: ${message}` : name;
};

const codeMessage = (codigo: ErrorCode, locale: Locale): string =>
  t(CODE_MESSAGES[codigo] ?? "error.internalError", undefined, locale);

const describeError = (error: Error, locale: Locale): ApiError => {
  if (isZodError(error)) {
    const detail = validationDetail(error.issues);
    return {
      codigo: "validation_error",
      status: CODE_STATUS.validation_error,
      mensaje: detail.length > 0 ? detail : codeMessage("validation_error", locale),
      detalle: internalMessage(error),
      stack: error.stack,
    };
  }
  if (error instanceof ObjectOperationError) {
    const codigo = OBJECT_ERROR_CODES[error.key] ?? "invalid_object_write";
    return {
      codigo,
      status: CODE_STATUS[codigo],
      mensaje: t(error.key, error.params, locale),
      detalle: internalMessage(error),
      stack: error.stack,
    };
  }
  if (error instanceof TypeOperationError) {
    const codigo = TYPE_ERROR_CODES[error.key] ?? "validation_error";
    return {
      codigo,
      status: CODE_STATUS[codigo],
      mensaje: t(error.key, error.params, locale),
      detalle: internalMessage(error),
      stack: error.stack,
    };
  }
  if (error instanceof ConfigError) {
    return {
      codigo: "config_error",
      status: CODE_STATUS.config_error,
      mensaje: t("error.invalidConfig", { path: error.path }, locale),
      detalle: internalMessage(error),
      stack: error.stack,
    };
  }
  if (error instanceof IndexError) {
    return {
      codigo: "index_error",
      status: CODE_STATUS.index_error,
      mensaje: codeMessage("index_error", locale),
      detalle: internalMessage(error),
      stack: error.stack,
    };
  }
  if (error instanceof HTTPException) {
    const mapped = HTTP_ERROR_CODES[error.status];
    const codigo = mapped ?? (error.status >= 500 ? "internal_error" : "bad_request");
    return {
      codigo,
      status: mapped === undefined && error.status < 500 ? error.status : CODE_STATUS[codigo],
      mensaje: codeMessage(codigo, locale),
      detalle: `HTTP ${error.status} ${internalMessage(error)}`,
      stack: error.stack,
    };
  }
  return {
    codigo: "internal_error",
    status: CODE_STATUS.internal_error,
    mensaje: codeMessage("internal_error", locale),
    detalle: internalMessage(error),
    stack: error.stack,
  };
};

const logError = (c: Context<ServerEnv>, api: ApiError): void => {
  writeLog({
    event: "error",
    requestId: c.get("requestId") ?? createRequestId(),
    codigo: api.codigo,
    mensaje: api.detalle,
    stack: api.stack,
  });
};

export type ErrorHandlingOptions = {
  readonly fallbackLocale?: Locale;
};

export const registerErrorHandling = (
  app: Hono<ServerEnv>,
  options: ErrorHandlingOptions = {},
): void => {
  const fallbackLocale = options.fallbackLocale ?? defaultLocale;
  const localeOf = (c: Context<ServerEnv>): Locale =>
    resolveLocale(c.req.header("accept-language"), fallbackLocale);

  app.notFound((c) => {
    const body = errorBodySchema.parse({
      error: { codigo: "not_found", mensaje: codeMessage("not_found", localeOf(c)) },
    });
    return c.json(body, CODE_STATUS.not_found);
  });

  app.onError((error, c) => {
    const api = describeError(error, localeOf(c));
    logError(c, api);
    const body = errorBodySchema.parse({
      error: { codigo: api.codigo, mensaje: api.mensaje },
    });
    return c.json(body, api.status);
  });
};
