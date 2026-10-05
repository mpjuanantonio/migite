import { type Config, clavesApiAusentes, t } from "@migite/core";

const PUERTO_DEFECTO = 3000;
const PATRON_PUERTO = /^\d+$/;

const CODIGOS_DE_ESCUCHA: Readonly<Record<string, string>> = {
  EADDRINUSE: "el puerto ya está en uso (EADDRINUSE)",
  EACCES: "no hay permisos para escuchar en el puerto (EACCES)",
  EADDRNOTAVAIL: "la dirección de red no está disponible (EADDRNOTAVAIL)",
};

export const resolverPuerto = (valor: string | undefined): number => {
  if (valor === undefined) {
    return PUERTO_DEFECTO;
  }

  const texto = valor.trim();
  const numero = PATRON_PUERTO.test(texto) ? Number(texto) : Number.NaN;
  if (!Number.isInteger(numero) || numero < 1 || numero > 65535) {
    throw new Error(
      `PORT inválido: «${texto}» no es un entero entre 1 y 65535 (valor por defecto: ${PUERTO_DEFECTO})`,
    );
  }
  return numero;
};

const codigoDeError = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
};

const detalleDeError = (error: unknown): string => {
  const codigo = codigoDeError(error);
  if (codigo !== undefined) {
    const conocido = CODIGOS_DE_ESCUCHA[codigo];
    if (conocido !== undefined) {
      return conocido;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const mensajeDeErrorDeServidor = (error: unknown): string =>
  `No se pudo iniciar el servidor: ${detalleDeError(error)}`;

export const avisosDeArranque = (
  config: Config,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly string[] =>
  clavesApiAusentes(config.llm, env).map((variable) =>
    t("aviso.claveApiAusente", { variable }, config.app.idioma),
  );
