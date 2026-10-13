import { describe, expect, it } from "vitest";
import {
  CLASE_CITA,
  CLASE_CODIGO,
  CLASE_CODIGO_BORDE,
  CLASE_CODIGO_INLINE,
  CLASE_CURSIVA,
  CLASE_LISTA,
  CLASE_NEGRITA,
  CLASE_REGLA,
  CLASE_TACHADO,
  CLASE_TAREA,
  CLASE_TAREA_HECHA,
  calcularDecoraciones,
  claseEncabezado,
} from "./live-preview";

describe("live preview en línea", () => {
  it("renderiza negrita ocultando los asteriscos cuando el cursor está fuera del tramo", () => {
    const decoraciones = calcularDecoraciones("hola **mundo** fin", 0);

    expect(decoraciones).toContainEqual({ tipo: "ocultar", desde: 5, hasta: 7 });
    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 7,
      hasta: 12,
      clase: CLASE_NEGRITA,
    });
    expect(decoraciones).toContainEqual({ tipo: "ocultar", desde: 12, hasta: 14 });
  });

  it("muestra la fuente cuando el cursor está dentro del tramo", () => {
    expect(calcularDecoraciones("hola **mundo** fin", 8)).toEqual([]);
    expect(calcularDecoraciones("hola **mundo** fin", 5)).toEqual([]);
  });

  it("vuelve a renderizar cuando el cursor sale por el final del tramo", () => {
    const decoraciones = calcularDecoraciones("hola **mundo** fin", 14);

    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 7,
      hasta: 12,
      clase: CLASE_NEGRITA,
    });
  });

  it("renderiza cursiva, tachado y código en línea", () => {
    const decoraciones = calcularDecoraciones("una *idea*, ~~vieja~~ y `código`", 0);

    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 5,
      hasta: 9,
      clase: CLASE_CURSIVA,
    });
    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 14,
      hasta: 19,
      clase: CLASE_TACHADO,
    });
    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 25,
      hasta: 31,
      clase: CLASE_CODIGO_INLINE,
    });
  });

  it("no interpreta la sintaxis en línea dentro del código en línea", () => {
    const decoraciones = calcularDecoraciones("`**no negrita**`", -1);

    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 1,
      hasta: 15,
      clase: CLASE_CODIGO_INLINE,
    });
    expect(
      decoraciones.some(
        (decoracion) => decoracion.tipo === "marca" && decoracion.clase === CLASE_NEGRITA,
      ),
    ).toBe(false);
  });

  it("convierte los enlaces markdown en widgets", () => {
    const decoraciones = calcularDecoraciones("Mira [la guía](https://ejemplo.dev) ya", 0);

    expect(decoraciones).toContainEqual({
      tipo: "widget",
      desde: 5,
      hasta: 35,
      widget: { tipo: "enlace", texto: "la guía", url: "https://ejemplo.dev" },
    });
  });

  it("convierte los wikilinks en widgets con y sin alias", () => {
    const decoraciones = calcularDecoraciones("[[Diario de viaje|el diario]] y [[Tareas]]", -1);

    expect(decoraciones).toContainEqual({
      tipo: "widget",
      desde: 0,
      hasta: 29,
      widget: { tipo: "wikilink", titulo: "Diario de viaje", etiqueta: "el diario" },
    });
    expect(decoraciones).toContainEqual({
      tipo: "widget",
      desde: 32,
      hasta: 42,
      widget: { tipo: "wikilink", titulo: "Tareas", etiqueta: "Tareas" },
    });
  });

  it("con el cursor en un wikilink muestra la fuente y no genera widget", () => {
    const decoraciones = calcularDecoraciones("[[Diario de viaje]]", 3);

    expect(decoraciones).toEqual([]);
  });

  it("con un cursor negativo (sin foco) renderiza todo", () => {
    const decoraciones = calcularDecoraciones("**negrita**", -1);

    expect(decoraciones).toContainEqual({
      tipo: "marca",
      desde: 2,
      hasta: 9,
      clase: CLASE_NEGRITA,
    });
  });
});

describe("live preview en bloque", () => {
  it("estiliza encabezados y oculta las almohadillas cuando el cursor está fuera de la línea", () => {
    const decoraciones = calcularDecoraciones("# Título\n\nTexto", 11);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: claseEncabezado(1) });
    expect(decoraciones).toContainEqual({ tipo: "ocultar", desde: 0, hasta: 2 });
  });

  it("mantiene el estilo del encabezado pero muestra las almohadillas con el cursor en la línea", () => {
    const decoraciones = calcularDecoraciones("# Título\n\nTexto", 3);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: claseEncabezado(1) });
    expect(decoraciones).not.toContainEqual({ tipo: "ocultar", desde: 0, hasta: 2 });
  });

  it("reconoce los seis niveles de encabezado", () => {
    const decoraciones = calcularDecoraciones("### Tres\n\nTexto", 9);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: claseEncabezado(3) });
    expect(decoraciones).toContainEqual({ tipo: "ocultar", desde: 0, hasta: 4 });
  });

  it("convierte las viñetas en marcadores cuando el cursor está fuera de la línea", () => {
    const decoraciones = calcularDecoraciones("- uno\n- dos", 7);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: CLASE_LISTA });
    expect(decoraciones).toContainEqual({
      tipo: "widget",
      desde: 0,
      hasta: 1,
      widget: { tipo: "marcador", texto: "•" },
    });
    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 6, clase: CLASE_LISTA });
    expect(
      decoraciones.some((decoracion) => decoracion.tipo === "widget" && decoracion.desde === 6),
    ).toBe(false);
  });

  it("convierte las tareas en checkboxes clicables", () => {
    const decoraciones = calcularDecoraciones("- [ ] pendiente\n- [x] hecha", 0);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: CLASE_TAREA });
    expect(decoraciones).not.toContainEqual({
      tipo: "widget",
      desde: 0,
      hasta: 6,
      widget: { tipo: "checkbox", marcado: false },
    });
    expect(decoraciones).toContainEqual({
      tipo: "widget",
      desde: 16,
      hasta: 22,
      widget: { tipo: "checkbox", marcado: true },
    });
    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 16, clase: CLASE_TAREA_HECHA });
  });

  it("estiliza las citas y oculta el prefijo fuera de la línea", () => {
    const decoraciones = calcularDecoraciones("> una nota\n\ntexto", 13);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: CLASE_CITA });
    expect(decoraciones).toContainEqual({ tipo: "ocultar", desde: 0, hasta: 2 });
  });

  it("oculta la regla horizontal y le da línea propia", () => {
    const decoraciones = calcularDecoraciones("texto\n---", 2);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 6, clase: CLASE_REGLA });
    expect(decoraciones).toContainEqual({ tipo: "ocultar", desde: 6, hasta: 9 });
  });

  it("con el cursor en la regla muestra la fuente", () => {
    const decoraciones = calcularDecoraciones("texto\n---", 7);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 6, clase: CLASE_REGLA });
    expect(decoraciones).not.toContainEqual({ tipo: "ocultar", desde: 6, hasta: 9 });
  });

  it("estiliza listas numeradas sin tocar el marcador", () => {
    const decoraciones = calcularDecoraciones("1. uno\n2. dos", 8);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: CLASE_LISTA });
    expect(
      decoraciones.some((decoracion) => decoracion.tipo === "widget" && decoracion.desde === 0),
    ).toBe(false);
  });

  it("estiliza los bloques de código y no interpreta su interior", () => {
    const texto = "```\n*no cursiva*\n```\n\nfin";
    const decoraciones = calcularDecoraciones(texto, -1);

    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: CLASE_CODIGO });
    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 0, clase: CLASE_CODIGO_BORDE });
    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 4, clase: CLASE_CODIGO });
    expect(decoraciones).toContainEqual({ tipo: "linea", desde: 17, clase: CLASE_CODIGO_BORDE });
    expect(
      decoraciones.some(
        (decoracion) => decoracion.tipo === "marca" && decoracion.clase === CLASE_CURSIVA,
      ),
    ).toBe(false);
  });

  it("con el cursor dentro del bloque de código muestra la fuente", () => {
    const texto = "```\n*no cursiva*\n```";
    const decoraciones = calcularDecoraciones(texto, 5);

    expect(
      decoraciones.some(
        (decoracion) => decoracion.tipo === "linea" && decoracion.clase === CLASE_CODIGO,
      ),
    ).toBe(false);
  });
});
