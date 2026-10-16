import { describe, expect, it } from "vitest";
import {
  accionEstadoSchema,
  accionesListSchema,
  accionPropuestaSchema,
  accionSchema,
  borrarObjetoPayloadSchema,
  crearObjetoPayloadSchema,
  editarObjetoPayloadSchema,
  tipoAccionSchema,
} from "./acciones.js";

const ACCION_ID = "01JACCION000000000000000000";

const OBJETO_ID = "01JOBJETO000000000000000000";

const CREACION = "2026-10-16T10:00:00.000Z";

const base = {
  id: ACCION_ID,
  estado: "pendiente" as const,
  creada: CREACION,
};

describe("tipoAccionSchema y accionEstadoSchema", () => {
  it("accepts the supported action types and states", () => {
    expect(tipoAccionSchema.parse("crear_objeto")).toBe("crear_objeto");
    expect(tipoAccionSchema.parse("editar_objeto")).toBe("editar_objeto");
    expect(tipoAccionSchema.parse("borrar_objeto")).toBe("borrar_objeto");
    expect(accionEstadoSchema.parse("pendiente")).toBe("pendiente");
    expect(accionEstadoSchema.parse("aplicada")).toBe("aplicada");
    expect(accionEstadoSchema.parse("rechazada")).toBe("rechazada");
    expect(accionEstadoSchema.parse("error")).toBe("error");
  });

  it("rejects unknown action types and states", () => {
    expect(tipoAccionSchema.safeParse("crear_tipo").success).toBe(false);
    expect(accionEstadoSchema.safeParse("en curso").success).toBe(false);
  });
});

describe("payloads por tipo de acción", () => {
  it("validates the crear_objeto payload like a create body", () => {
    const payload = crearObjetoPayloadSchema.parse({
      tipo: "nota",
      titulo: "Nota nueva",
      atributos: { etiquetas: ["trabajo"] },
      cuerpo: "hola",
      carpeta: "proyectos",
      enlaces: ["[[Otra nota]]"],
    });

    expect(payload.titulo).toBe("Nota nueva");
    expect(crearObjetoPayloadSchema.safeParse({ titulo: "" }).success).toBe(false);
    expect(crearObjetoPayloadSchema.safeParse({ titulo: "Nota", extra: 1 }).success).toBe(false);
  });

  it("validates the editar_objeto payload with partial changes", () => {
    const payload = editarObjetoPayloadSchema.parse({
      id: OBJETO_ID,
      cambios: { cuerpo: "nuevo" },
    });

    expect(payload.cambios.cuerpo).toBe("nuevo");
    expect(editarObjetoPayloadSchema.safeParse({ cambios: {} }).success).toBe(false);
    expect(
      editarObjetoPayloadSchema.safeParse({ id: "  ", cambios: { titulo: "x" } }).success,
    ).toBe(false);
    expect(
      editarObjetoPayloadSchema.safeParse({ id: OBJETO_ID, cambios: { raro: true } }).success,
    ).toBe(false);
  });

  it("validates the borrar_objeto payload", () => {
    expect(borrarObjetoPayloadSchema.parse({ id: OBJETO_ID })).toEqual({ id: OBJETO_ID });
    expect(borrarObjetoPayloadSchema.safeParse({}).success).toBe(false);
    expect(borrarObjetoPayloadSchema.safeParse({ id: OBJETO_ID, extra: 1 }).success).toBe(false);
  });
});

describe("accionPropuestaSchema", () => {
  it("validates a pending proposal per action type", () => {
    const crear = accionPropuestaSchema.parse({
      ...base,
      tipoAccion: "crear_objeto",
      payload: { titulo: "Nota nueva" },
    });
    const editar = accionPropuestaSchema.parse({
      ...base,
      tipoAccion: "editar_objeto",
      payload: { id: OBJETO_ID, cambios: { cuerpo: "nuevo" } },
    });
    const borrar = accionPropuestaSchema.parse({
      ...base,
      tipoAccion: "borrar_objeto",
      payload: { id: OBJETO_ID },
    });

    expect(crear.tipoAccion).toBe("crear_objeto");
    expect(crear.payload).toEqual({ titulo: "Nota nueva" });
    expect(editar.tipoAccion).toBe("editar_objeto");
    expect(editar.payload).toEqual({ id: OBJETO_ID, cambios: { cuerpo: "nuevo" } });
    expect(borrar.tipoAccion).toBe("borrar_objeto");
    expect(borrar.payload).toEqual({ id: OBJETO_ID });
  });

  it("accepts the state detail and result envelope fields", () => {
    const accion = accionPropuestaSchema.parse({
      ...base,
      tipoAccion: "crear_objeto",
      payload: { titulo: "Nota nueva" },
      estado: "error",
      detalle: "no se pudo aplicar [ruta]",
      resultado: { id: OBJETO_ID },
    });

    expect(accion.detalle).toBe("no se pudo aplicar [ruta]");
    expect(accion.resultado).toEqual({ id: OBJETO_ID });
  });

  it("rejects a payload that does not match its action type", () => {
    expect(
      accionPropuestaSchema.safeParse({
        ...base,
        tipoAccion: "crear_objeto",
        payload: { id: OBJETO_ID },
      }).success,
    ).toBe(false);
    expect(
      accionPropuestaSchema.safeParse({
        ...base,
        tipoAccion: "borrar_objeto",
        payload: { titulo: "Nota" },
      }).success,
    ).toBe(false);
    expect(
      accionPropuestaSchema.safeParse({
        ...base,
        tipoAccion: "crear_tipo",
        payload: {},
      }).success,
    ).toBe(false);
  });

  it("rejects a proposal without an id or with an unknown state", () => {
    expect(
      accionPropuestaSchema.safeParse({
        estado: "pendiente",
        creada: CREACION,
        tipoAccion: "borrar_objeto",
        payload: { id: OBJETO_ID },
      }).success,
    ).toBe(false);
    expect(
      accionPropuestaSchema.safeParse({
        ...base,
        estado: "a medias",
        tipoAccion: "borrar_objeto",
        payload: { id: OBJETO_ID },
      }).success,
    ).toBe(false);
  });
});

describe("accionesListSchema", () => {
  it("reads proposals whose type is not supported yet without breaking the list", () => {
    const list = accionesListSchema.parse({
      acciones: [
        {
          ...base,
          tipoAccion: "crear_tipo",
          payload: { id: "receta" },
          estado: "error",
          detalle: "el tipo no se pudo crear",
        },
      ],
    });

    expect(list.acciones).toHaveLength(1);
    expect(list.acciones[0]?.tipoAccion).toBe("crear_tipo");
  });

  it("still validates the common envelope of every action", () => {
    expect(
      accionesListSchema.safeParse({
        acciones: [{ ...base, tipoAccion: "crear_tipo", payload: {}, estado: "rara" }],
      }).success,
    ).toBe(false);
    expect(accionSchema.safeParse({ tipoAccion: "borrar_objeto" }).success).toBe(false);
  });
});
