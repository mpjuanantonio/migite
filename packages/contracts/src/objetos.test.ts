import { describe, expect, it } from "vitest";
import {
  arbolObjetosParamsSchema,
  arbolObjetosSchema,
  createObjectBodySchema,
  degradationReasonSchema,
  enlaceEntranteSchema,
  enlacesEntrantesSchema,
  LIMITE_MAX_ARBOL,
  MAX_ATRIBUTOS_OBJETO,
  MAX_CUERPO_OBJETO,
  MAX_TITULO_OBJETO,
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
      enlaces: ["[[Proyecto X]]", "[[Otra nota#seccion|alias]]"],
    };

    expect(createObjectBodySchema.parse(body)).toEqual(body);
  });

  it("accepts links wrapped in spaces and an empty list", () => {
    expect(
      createObjectBodySchema.parse({ titulo: "Nota", enlaces: ["  [[Proyecto X]]  "] }),
    ).toEqual({ titulo: "Nota", enlaces: ["[[Proyecto X]]"] });
    expect(createObjectBodySchema.parse({ titulo: "Nota", enlaces: [] })).toEqual({
      titulo: "Nota",
      enlaces: [],
    });
  });

  it("rejects links that are not wikilinks", () => {
    expect(
      createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: ["Proyecto X"] }).success,
    ).toBe(false);
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: ["[[]]"] }).success).toBe(
      false,
    );
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: [""] }).success).toBe(false);
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: "[[X]]" }).success).toBe(
      false,
    );
  });

  it("rejects links with line breaks or control characters", () => {
    const invalid = [
      "[[Nota\nrota]]",
      "[[Nota\rrota]]",
      "[[Nota\u0000rota]]",
      "[[Nota\u009frota]]",
    ];

    for (const link of invalid) {
      expect(
        createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: [link] }).success,
        JSON.stringify(link),
      ).toBe(false);
    }
  });

  it("rejects links longer than the per-link limit", () => {
    const longest = `[[${"a".repeat(296)}]]`;
    const tooLong = `[[${"a".repeat(297)}]]`;

    expect(longest).toHaveLength(300);
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: [longest] }).success).toBe(
      true,
    );
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: [tooLong] }).success).toBe(
      false,
    );
  });

  it("rejects more links than the limit", () => {
    const tooMany = Array.from({ length: 101 }, (_, index) => `[[Nota ${index}]]`);

    expect(createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: tooMany }).success).toBe(
      false,
    );
    expect(
      createObjectBodySchema.safeParse({ titulo: "Nota", enlaces: tooMany.slice(0, 100) }).success,
    ).toBe(true);
  });

  it("rejects an empty or missing titulo", () => {
    expect(createObjectBodySchema.safeParse({}).success).toBe(false);
    expect(createObjectBodySchema.safeParse({ titulo: "   " }).success).toBe(false);
  });

  it("rejects unknown keys and invalid attributes", () => {
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", extra: true }).success).toBe(false);
    expect(createObjectBodySchema.safeParse({ titulo: "Nota", atributos: [] }).success).toBe(false);
  });

  it("rejects a titulo longer than the limit", () => {
    const titulo = "a".repeat(MAX_TITULO_OBJETO);

    expect(createObjectBodySchema.safeParse({ titulo }).success).toBe(true);
    expect(createObjectBodySchema.safeParse({ titulo: `${titulo}a` }).success).toBe(false);
    expect(patchObjectBodySchema.safeParse({ titulo: `${titulo}a` }).success).toBe(false);
    expect(renameObjectBodySchema.safeParse({ nuevoTitulo: `${titulo}a` }).success).toBe(false);
  });

  it("rejects a cuerpo longer than the limit", () => {
    expect(
      createObjectBodySchema.safeParse({ titulo: "Nota", cuerpo: "x".repeat(MAX_CUERPO_OBJETO) })
        .success,
    ).toBe(true);
    expect(
      createObjectBodySchema.safeParse({
        titulo: "Nota",
        cuerpo: "x".repeat(MAX_CUERPO_OBJETO + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects more attributes than the limit", () => {
    const atributos = (total: number): Record<string, number> =>
      Object.fromEntries(Array.from({ length: total }, (_, index) => [`clave${index}`, index]));

    expect(
      createObjectBodySchema.safeParse({
        titulo: "Nota",
        atributos: atributos(MAX_ATRIBUTOS_OBJETO),
      }).success,
    ).toBe(true);
    expect(
      createObjectBodySchema.safeParse({
        titulo: "Nota",
        atributos: atributos(MAX_ATRIBUTOS_OBJETO + 1),
      }).success,
    ).toBe(false);
    expect(
      patchObjectBodySchema.safeParse({ atributos: atributos(MAX_ATRIBUTOS_OBJETO + 1) }).success,
    ).toBe(false);
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

  it("keeps enlaces out of the patch body", () => {
    expect(patchObjectBodySchema.safeParse({ enlaces: ["[[Proyecto X]]"] }).success).toBe(false);
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

describe("enlacesEntrantesSchema", () => {
  const entrante = {
    id: "01J8Z9K3M4N5P6Q7R8S9T0V1W2",
    titulo: "Fuente",
    ruta: "notas/fuente.md",
    contexto: "body",
  };

  it("accepts incoming links from the body and the frontmatter", () => {
    const body = { entrantes: [entrante, { ...entrante, contexto: "frontmatter" }] };

    expect(enlacesEntrantesSchema.parse(body)).toEqual(body);
  });

  it("accepts an empty list", () => {
    expect(enlacesEntrantesSchema.parse({ entrantes: [] })).toEqual({ entrantes: [] });
  });

  it("rejects an unknown context or missing fields", () => {
    expect(enlaceEntranteSchema.safeParse({ ...entrante, contexto: "otro" }).success).toBe(false);
    expect(enlaceEntranteSchema.safeParse({ ...entrante, titulo: undefined }).success).toBe(false);
    expect(enlacesEntrantesSchema.safeParse({}).success).toBe(false);
  });
});

describe("arbolObjetosParamsSchema", () => {
  it("accepts empty params, a tipo and a coerced limite", () => {
    expect(arbolObjetosParamsSchema.parse({})).toEqual({});
    expect(arbolObjetosParamsSchema.parse({ tipo: "nota" })).toEqual({ tipo: "nota" });
    expect(arbolObjetosParamsSchema.parse({ limite: "25" })).toEqual({ limite: 25 });
  });

  it("rejects an empty tipo and out-of-range or invalid limits", () => {
    expect(arbolObjetosParamsSchema.safeParse({ tipo: " " }).success).toBe(false);
    expect(arbolObjetosParamsSchema.safeParse({ limite: 0 }).success).toBe(false);
    expect(arbolObjetosParamsSchema.safeParse({ limite: LIMITE_MAX_ARBOL + 1 }).success).toBe(
      false,
    );
    expect(arbolObjetosParamsSchema.safeParse({ limite: "no-numero" }).success).toBe(false);
  });

  it("rejects repeated params", () => {
    expect(arbolObjetosParamsSchema.safeParse({ tipo: ["nota", "tarea"] }).success).toBe(false);
    expect(arbolObjetosParamsSchema.safeParse({ limite: ["1", "2"] }).success).toBe(false);
  });
});

describe("arbolObjetosSchema", () => {
  const nodo = {
    id: "01JALFA",
    tipo: "nota",
    titulo: "Alfa",
    ruta: "notas/alfa.md",
    carpeta: "notas",
    actualizado: "2026-10-05T09:00:00.000+02:00",
  };

  it("accepts an empty tree and a tree with light nodes", () => {
    expect(arbolObjetosSchema.parse({ nodos: [] })).toEqual({ nodos: [] });
    expect(arbolObjetosSchema.parse({ nodos: [nodo] })).toEqual({ nodos: [nodo] });
  });

  it("rejects a tree without nodos or with incomplete nodes", () => {
    const { titulo: _titulo, ...sinTitulo } = nodo;

    expect(arbolObjetosSchema.safeParse({}).success).toBe(false);
    expect(arbolObjetosSchema.safeParse({ nodos: [sinTitulo] }).success).toBe(false);
    expect(arbolObjetosSchema.safeParse({ nodos: [{ ...nodo, ruta: 7 }] }).success).toBe(false);
  });
});
