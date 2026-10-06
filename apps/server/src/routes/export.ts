import { Hono } from "hono";
import type { ServerEnv } from "../env.js";
import { createExportZip, type ExportDeps, exportFilename } from "../services/export.js";

let deps: ExportDeps | undefined;

export const configureExport = (next: ExportDeps): void => {
  deps = next;
};

const currentDeps = (): ExportDeps => {
  if (deps === undefined) {
    throw new Error("el runtime de exportación no está configurado");
  }
  return deps;
};

export const exportRouter = new Hono<ServerEnv>();

exportRouter.post("/", (c) => {
  const zip = createExportZip(currentDeps());
  return c.body(zip, 200, {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${exportFilename()}"`,
  });
});
