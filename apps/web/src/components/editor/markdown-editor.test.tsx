import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditorState, EditorView, type Extension } from "@uiw/react-codemirror";
import { type ReactNode, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/context";
import { TemaProvider } from "@/theme/context";
import { MarkdownEditor } from "./markdown-editor";

const cmProps = vi.hoisted(() => ({ llamadas: [] as Record<string, unknown>[] }));

vi.mock("@uiw/react-codemirror", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uiw/react-codemirror")>();
  return {
    ...actual,
    default: (props: {
      readonly value?: string;
      readonly onChange?: (value: string) => void;
      readonly "aria-label"?: string;
      readonly placeholder?: string;
      readonly extensions?: unknown;
    }) => {
      cmProps.llamadas.push({ ...props });
      return (
        <textarea
          aria-label={props["aria-label"]}
          placeholder={props.placeholder}
          value={props.value ?? ""}
          onChange={(event) => props.onChange?.(event.target.value)}
        />
      );
    },
  };
});

const conProveedores = (contenido: ReactNode) =>
  render(
    <I18nProvider initialLocale="es">
      <TemaProvider>{contenido}</TemaProvider>
    </I18nProvider>,
  );

const EditorControlado = ({ sugerencias = [] }: { readonly sugerencias?: readonly string[] }) => {
  const [valor, setValor] = useState("");
  return (
    <MarkdownEditor
      value={valor}
      onChange={setValor}
      ariaLabel="Cuerpo de la ficha en markdown"
      sugerencias={sugerencias}
    />
  );
};

beforeEach(() => {
  localStorage.clear();
  cmProps.llamadas.length = 0;
});

const atributosDelEditable = (): Record<string, string> => {
  const props = cmProps.llamadas.at(-1);
  if (props === undefined) {
    throw new Error("el editor no se ha renderizado");
  }
  const state = EditorState.create({ extensions: props.extensions as Extension });
  return Object.assign({}, ...state.facet(EditorView.contentAttributes));
};

describe("editor markdown", () => {
  it("pasa valor, etiqueta y extensiones al editor", () => {
    const onChange = vi.fn();
    conProveedores(
      <MarkdownEditor
        value="# Diario"
        onChange={onChange}
        ariaLabel="Cuerpo de la ficha en markdown"
        placeholder="Escribe la ficha…"
      />,
    );

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    expect(editor).toHaveValue("# Diario");
    expect(editor).toHaveAttribute("placeholder", "Escribe la ficha…");

    const props = cmProps.llamadas.at(-1);
    expect(props).toBeDefined();
    if (props === undefined) {
      return;
    }
    expect(props.onChange).toBeTypeOf("function");
    const extensiones = props.extensions;
    expect(Array.isArray(extensiones) && extensiones.length > 0).toBe(true);
    expect(props.indentWithTab).toBe(false);
  });

  it("propaga los cambios del texto", () => {
    const onChange = vi.fn();
    conProveedores(
      <MarkdownEditor value="" onChange={onChange} ariaLabel="Cuerpo de la ficha en markdown" />,
    );

    fireEvent.change(screen.getByLabelText("Cuerpo de la ficha en markdown"), {
      target: { value: "Cuerpo nuevo" },
    });

    expect(onChange).toHaveBeenCalledWith("Cuerpo nuevo");
  });
});

describe("sugerencias de wikilink", () => {
  const sugerencias = ["Diario de viaje", "Tareas del mes"];

  it("sugiere objetos al escribir «[[» y filtra por lo tecleado", async () => {
    const user = userEvent.setup();
    conProveedores(<EditorControlado sugerencias={sugerencias} />);

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    fireEvent.change(editor, { target: { value: "[[Dia" } });

    const opcion = await screen.findByRole("option", { name: "Diario de viaje" });
    expect(screen.queryByRole("option", { name: "Tareas del mes" })).toBeNull();

    await user.click(opcion);

    expect(editor).toHaveValue("[[Diario de viaje]]");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("recorre las sugerencias con las flechas e inserta con Enter", async () => {
    const user = userEvent.setup();
    conProveedores(<EditorControlado sugerencias={sugerencias} />);

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    await user.click(editor);
    fireEvent.change(editor, { target: { value: "[[" } });
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("option", { name: "Tareas del mes" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{Enter}");

    expect(editor).toHaveValue("[[Tareas del mes]]");
  });

  it("señala la opción activa con aria-activedescendant sobre el editable", async () => {
    const user = userEvent.setup();
    conProveedores(<EditorControlado sugerencias={sugerencias} />);

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    await user.click(editor);
    fireEvent.change(editor, { target: { value: "[[" } });
    await screen.findByRole("listbox");

    const primera = screen.getByRole("option", { name: "Diario de viaje" });
    expect(primera).toHaveAttribute("aria-selected", "true");
    expect(primera.id).not.toBe("");
    expect(atributosDelEditable()["aria-activedescendant"]).toBe(primera.id);

    await user.keyboard("{ArrowDown}");

    const segunda = screen.getByRole("option", { name: "Tareas del mes" });
    expect(segunda).toHaveAttribute("aria-selected", "true");
    expect(atributosDelEditable()["aria-activedescendant"]).toBe(segunda.id);
  });

  it("cierra las sugerencias con Escape", async () => {
    const user = userEvent.setup();
    conProveedores(<EditorControlado sugerencias={sugerencias} />);

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    await user.click(editor);
    fireEvent.change(editor, { target: { value: "[[" } });
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).toBeNull();
    });
  });

  it("ofrece crear la nota cuando no hay coincidencias e inserta «[[texto]]»", async () => {
    const user = userEvent.setup();
    conProveedores(<EditorControlado sugerencias={sugerencias} />);

    const editor = screen.getByLabelText("Cuerpo de la ficha en markdown");
    fireEvent.change(editor, { target: { value: "[[Zeta" } });

    const opcion = await screen.findByRole("option", { name: "Crear nota «Zeta»" });
    await user.click(opcion);

    expect(editor).toHaveValue("[[Zeta]]");
  });
});
