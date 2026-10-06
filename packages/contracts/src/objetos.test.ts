import { describe, expect, it } from "vitest";
import {
  createObjectBodySchema,
  degradationReasonSchema,
  objectPayloadSchema,
  patchObjectBodySchema,
  renameObjectBodySchema,
  renameReportSchema,
} from "./objetos.js";

const validPayload = {
  id: "01J8Z9K3M4N5P6Q7R8S9T0V1W2",
  tipo: "nota",
  titulo: "Nota de prueba",
  ruta: "notas/nota-de-prueba.md",
  carpeta: "notas",
  creado: "2026-10-06T10:00:00.000+02:00",
  actualizado: "2026-10-06T11:00:00.000+02:00",
  atributos: { etiquetas: ["prueba"] },
  cuerpo: "Contenido",
  enlaces: ["otra-nota"],
  degraded: [],
};

describe("degradationReasonSchema", () => {
  it("accepts every degradation kind", () => {
    const reasons = [
      { kind: "unknownType", type: "desconocido" },
      { kind: "brokenType", type: "roto", problems: ["sin atributos"] },
      { kind: "invalidAttribute", key: "peso", problems: ["tipo invalido"] },
      { kind: "unreadableFrontmatter", problems: ["yaml invalido"] },
    ];

    for (const reason of reasons) {
      expect(degradationReasonSchema.safeParse(reason).success).toBe(true);
    }
  });

  it("rejects an unknown kind", () => {
    expect(degradationReasonSchema.safeParse({ kind: "otro" }).success).toBe(false);
  });

  it("rejects a broken type without problems", () => {
    expect(degradationReasonSchema.safeParse({ kind: "brokenType", type: "roto" }).success).toBe(
      false,
    );
  });
});

describe("objectPayloadSchema", () => {
  it("accepts a full payload", () => {
    expect(objectPayloadSchema.parse(validPayload)).toEqual(validPayload);
  });

  it("accepts degraded reasons", () => {
    const payload = {
      ...validPayload,
      degraded: [{ kind: "unknownType", type: "desconocido" }],
    };

    expect(objectPayloadSchema.parse(payload).degraded).toHaveLength(1);
  });

  it("rejects a payload without titulo", () => {
    const { titulo: _titulo, ...rest } = validPayload;

    expect(objectPayloadSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid field types", () => {
    expect(objectPayloadSchema.safeParse({ ...validPayload, atributos: [] }).success).toBe(false);
    expect(objectPayloadSchema.safeParse({ ...validPayload, enlaces: "otra" }).success).toBe(false);
    expect(objectPayloadSchema.safeParse({ ...validPayload, degraded: [{}] }).success).toBe(false);
  });
});

describe("createObjectBodySchema", () => {
  it("accepts a minimal body", () => {
    expect(createObjectBodySchema.parse({ titulo: "Nota" })).toEqual({ titulo: "Nota" });
  });

  it("accepts a full body", () => {
    const body = {
      tipo: "nota",
      titulo: "Nota",
      atributos: { etiquetas: ["prueba"] },
      cuerpo: "Contenido",
      carpeta: "notas",
    };

    expect(createObjectBodySchema.parse(body)).toEqual(body);
  });

  it("rejects an empty or missing titulo", () => {
    expect(createObjectBodySchema.safeParse({}).success).toBe(false);
    expect(createObjectBodySchema.safeParse({ titulo: "   " }).success).toBe(false);
  });

  it("rejects unknown keys and invalid attributes", () => {
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", extra: true }).success).toBe(false);
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", atributos: [] }).success).toBe(false);
  });
});

describe("patchObjectBodySchema", () => {
  it("accepts partial bodies", () => {
    expect(patchObjectBodySchema.parse({ titulo: "Nueva" })).toEqual({ titulo: "Nueva" });
    expect(patchObjectBodySchema.parse({ atributos: { peso: 3 } })).toEqual({
      atributos: { peso: 3 },
    });
  });

  it("accepts an empty body", () => {
    expect(patchObjectBodySchema.parse({})).toEqual({});
  });

  it("rejects an empty titulo and unknown keys", () => {
    expect(patchObjectBodySchema.safeParse({ titulo: "" }).success).toBe(false);
    expect(patchObjectBodySchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe("renameObjectBodySchema", () => {
  it("accepts a new title", () => {
    expect(renameObjectBodySchema.parse({ nuevoTitulo: "Otro titulo" })).toEqual({
      nuevoTitulo: "Otro titulo",
    });
  });

  it("rejects an empty or missing title", () => {
    expect(renameObjectBodySchema.safeParse({ nuevoTitulo: " " }).success).toBe(false);
    expect(renameObjectBodySchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(renameObjectBodySchema.safeParse({ nuevoTitulo: "Otro", titulo: "Viejo" }).success).toBe(
      false,
    );
  });
});

describe("renameReportSchema", () => {
  const informe = {
    reescritos: ["enlaza.md"],
    omitidos: [{ path: "roto.md", problems: ["yaml invalido"] }],
    enlacesSinResolver: [{ path: "otra.md", link: "Beta" }],
  };

  it("accepts a rename report", () => {
    const body = { objeto: validPayload, informe };

    expect(renameReportSchema.parse(body)).toEqual(body);
  });

  it("accepts an empty report", () => {
    const body = {
      objeto: validPayload,
      informe: { reescritos: [], omitidos: [], enlacesSinResolver: [] },
    };

    expect(renameReportSchema.parse(body)).toEqual(body);
  });

  it("rejects a report without the object or with malformed sections", () => {
    expect(renameReportSchema.safeParse({ informe }).success).toBe(false);
    expect(renameReportSchema.safeParse({ objeto: validPayload }).success).toBe(false);
    expect(
      renameReportSchema.safeParse({
        objeto: validPayload,
        informe: { ...informe, omitidos: [{ path: "roto.md" }] },
      }).success,
    ).toBe(false);
  });
});
