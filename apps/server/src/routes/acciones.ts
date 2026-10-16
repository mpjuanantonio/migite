import { accionEstadoSchema, accionesListSchema, accionSchema } from "@migite/contracts";
import { Hono } from "hono";
import type { ServerEnv } from "../env.js";
import {
  type AccionesDeps,
  confirmarAccion,
  listarAcciones,
  rechazarAccion,
} from "../services/acciones.js";

let deps: AccionesDeps | undefined;

export const configureAcciones = (next: AccionesDeps): void => {
  deps = next;
};

const currentDeps = (): AccionesDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de acciones no está configurado");
  }
  return deps;
};

export const accionesRouter = new Hono<ServerEnv>();

accionesRouter.get("/", (c) => {
  const estado = c.req.query("estado");
  return c.json(
    accionesListSchema.parse({
      acciones: listarAcciones(
        currentDeps(),
        estado === undefined ? undefined : accionEstadoSchema.parse(estado),
      ),
    }),
  );
});

accionesRouter.post("/:id/confirmar", (c) =>
  c.json(accionSchema.parse(confirmarAccion(currentDeps(), c.req.param("id")))),
);

accionesRouter.post("/:id/rechazar", (c) => {
  rechazarAccion(currentDeps(), c.req.param("id"));
  return c.body(null, 204);
});
