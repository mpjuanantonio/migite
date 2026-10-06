import { Hono } from "hono";
import type { ServerEnv } from "../env.js";
import { evaluarSalud, type SaludDeps, SIN_RUNTIME } from "../services/salud.js";

let deps: SaludDeps | undefined;

export const configureHealth = (next: SaludDeps): void => {
  deps = next;
};

export const healthRouter = new Hono<ServerEnv>();

healthRouter.get("/", (c) => c.json(evaluarSalud(deps ?? SIN_RUNTIME)));
