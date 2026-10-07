import { errorBodySchema } from "@migite/contracts";
import { t } from "@migite/core";

export class ApiError extends Error {
  readonly codigo: string;
  readonly status: number;

  constructor(codigo: string, mensaje: string, status: number) {
    super(mensaje);
    this.name = "ApiError";
    this.codigo = codigo;
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | undefined;

export const setUnauthorizedHandler = (handler: UnauthorizedHandler | undefined): void => {
  unauthorizedHandler = handler;
};

export type ApiFetchOptions = {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly signal?: AbortSignal;
};

const JSON_TYPE = "application/json";

const toApiError = async (response: Response): Promise<ApiError> => {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const parsed = errorBodySchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(parsed.data.error.codigo, parsed.data.error.mensaje, response.status);
  }
  return new ApiError("generic_error", t("error.genericError"), response.status);
};

export const apiFetch = async <T>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
  const { method = "GET", body, signal } = options;
  const response = await fetch(path, {
    method,
    credentials: "include",
    signal,
    headers: {
      Accept: JSON_TYPE,
      ...(body === undefined ? {} : { "Content-Type": JSON_TYPE }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json();
  return payload as T;
};
