import type { AttributePayload, FieldTypeWire } from "@migite/contracts";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/context";
import { aTexto, aTextoCrudo } from "@/lib/atributos";

const ESTILO_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const TIPOS_INPUT: Partial<Record<FieldTypeWire, "number" | "date" | "datetime-local" | "url">> = {
  numero: "number",
  fecha: "date",
  "fecha-hora": "datetime-local",
  url: "url",
};

export type CampoAtributoProps = {
  readonly editorId: string;
  readonly etiquetaId: string;
  readonly definicion: AttributePayload | undefined;
  readonly valor: unknown;
  readonly crudo: boolean;
  readonly deshabilitado: boolean;
  readonly onCambio: (valor: unknown) => void;
};

export const CampoAtributo = ({
  editorId,
  etiquetaId,
  definicion,
  valor,
  crudo,
  deshabilitado,
  onCambio,
}: CampoAtributoProps) => {
  const { t } = useI18n();
  const tipo = crudo ? undefined : definicion?.tipo;
  const opciones = definicion?.opciones;

  if (tipo === "booleano") {
    return (
      <Switch
        id={editorId}
        aria-labelledby={etiquetaId}
        checked={valor === true}
        disabled={deshabilitado}
        onCheckedChange={(marcado) => onCambio(marcado)}
      />
    );
  }

  if (tipo === "seleccion" && opciones !== undefined) {
    return (
      <select
        id={editorId}
        aria-labelledby={etiquetaId}
        className={ESTILO_SELECT}
        value={aTexto(tipo, valor)}
        disabled={deshabilitado}
        onChange={(evento) => onCambio(evento.target.value)}
      >
        <option value="">{t("page.objeto.attributes.emptyOption")}</option>
        {opciones.map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    );
  }

  if (tipo === "multi-seleccion" && opciones !== undefined) {
    const seleccionadas = Array.isArray(valor)
      ? valor.filter((item): item is string => typeof item === "string")
      : [];
    return (
      <fieldset
        id={editorId}
        aria-labelledby={etiquetaId}
        className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
      >
        {opciones.map((opcion) => {
          const activa = seleccionadas.includes(opcion);
          return (
            <button
              key={opcion}
              type="button"
              aria-pressed={activa}
              disabled={deshabilitado}
              className={
                activa
                  ? "rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                  : "rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
              }
              onClick={() =>
                onCambio(
                  activa
                    ? seleccionadas.filter((item) => item !== opcion)
                    : [...seleccionadas, opcion],
                )
              }
            >
              {opcion}
            </button>
          );
        })}
      </fieldset>
    );
  }

  const tipoInput = tipo === undefined ? "text" : (TIPOS_INPUT[tipo] ?? "text");
  return (
    <Input
      id={editorId}
      aria-labelledby={etiquetaId}
      type={tipoInput}
      step={tipo === "numero" ? "any" : undefined}
      disabled={deshabilitado}
      value={crudo ? aTextoCrudo(valor) : aTexto(tipo, valor)}
      onChange={(evento) => onCambio(evento.target.value)}
    />
  );
};
