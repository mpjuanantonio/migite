import type { AttributePayload, FieldTypeWire, ObjectPayload } from "@migite/contracts";
import { Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ApiError } from "@/api/api";
import { useGuardarAtributos, useTipos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/context";
import {
  aTexto,
  aTextoCrudo,
  construirAtributos,
  esObligatorio,
  filtrarVacios,
  iguales,
} from "@/lib/atributos";

const ESTILO_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const TIPOS_INPUT: Partial<Record<FieldTypeWire, "number" | "date" | "datetime-local" | "url">> = {
  numero: "number",
  fecha: "date",
  "fecha-hora": "datetime-local",
  url: "url",
};

type EditorValorProps = {
  readonly editorId: string;
  readonly etiquetaId: string;
  readonly definicion: AttributePayload | undefined;
  readonly valor: unknown;
  readonly crudo: boolean;
  readonly deshabilitado: boolean;
  readonly onCambio: (valor: unknown) => void;
};

const EditorValor = ({
  editorId,
  etiquetaId,
  definicion,
  valor,
  crudo,
  deshabilitado,
  onCambio,
}: EditorValorProps) => {
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

type BandejaAtributosProps = {
  readonly objeto: ObjectPayload;
};

export const BandejaAtributos = ({ objeto }: BandejaAtributosProps) => {
  const { t } = useI18n();
  const tipos = useTipos();
  const guardar = useGuardarAtributos(objeto.id);
  const [borrador, setBorrador] = useState<{
    readonly objetoId: string;
    readonly valores: Readonly<Record<string, unknown>>;
    readonly eliminados: readonly string[];
  }>();
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");
  const [guardadoEn, setGuardadoEn] = useState<string>();

  const tipo = tipos.data?.find((item) => item.id === objeto.tipo);
  const crudo =
    objeto.degraded.length > 0 || tipos.isError || (tipos.isSuccess && tipo === undefined);
  const definiciones = useMemo(
    () => new Map((tipo?.atributos ?? []).map((item) => [item.id, item])),
    [tipo],
  );

  const actual = borrador !== undefined && borrador.objetoId === objeto.id ? borrador : undefined;
  const valores = actual?.valores ?? {};
  const eliminados = actual?.eliminados ?? [];

  const filas = useMemo(() => {
    const base = filtrarVacios(objeto.atributos);
    const visible = (clave: string): boolean => !eliminados.includes(clave);
    if (crudo) {
      const claves = new Set([...Object.keys(base), ...Object.keys(valores)]);
      return [...claves].filter(visible).map((clave) => ({
        clave,
        valor: clave in valores ? valores[clave] : base[clave],
        definicion: definiciones.get(clave),
      }));
    }
    const resultado: {
      clave: string;
      valor: unknown;
      definicion: AttributePayload | undefined;
    }[] = [];
    const vistas = new Set<string>();
    for (const definicion of tipo?.atributos ?? []) {
      if (!visible(definicion.id)) {
        continue;
      }
      resultado.push({
        clave: definicion.id,
        valor: definicion.id in valores ? valores[definicion.id] : base[definicion.id],
        definicion,
      });
      vistas.add(definicion.id);
    }
    for (const [clave, valor] of Object.entries(base)) {
      if (vistas.has(clave) || !visible(clave)) {
        continue;
      }
      resultado.push({
        clave,
        valor: clave in valores ? valores[clave] : valor,
        definicion: definiciones.get(clave),
      });
      vistas.add(clave);
    }
    for (const [clave, valor] of Object.entries(valores)) {
      if (vistas.has(clave) || !visible(clave)) {
        continue;
      }
      resultado.push({ clave, valor, definicion: definiciones.get(clave) });
      vistas.add(clave);
    }
    return resultado;
  }, [objeto.atributos, tipo, valores, eliminados, definiciones, crudo]);

  const deseados = useMemo(
    () => construirAtributos(objeto, actual, definiciones),
    [objeto, actual, definiciones],
  );
  const conCambios = !iguales(deseados, filtrarVacios(objeto.atributos));
  const guardando = guardar.isPending;
  const puedeGuardar = conCambios && !guardando;

  const actualizar = useCallback(
    (clave: string, valor: unknown) => {
      setBorrador((previo) => {
        const vigente =
          previo !== undefined && previo.objetoId === objeto.id
            ? previo
            : { objetoId: objeto.id, valores: {}, eliminados: [] as readonly string[] };
        return {
          ...vigente,
          valores: { ...vigente.valores, [clave]: valor },
          eliminados: vigente.eliminados.filter((item) => item !== clave),
        };
      });
      setGuardadoEn(undefined);
    },
    [objeto.id],
  );

  const eliminar = useCallback(
    (clave: string) => {
      setBorrador((previo) => {
        const vigente =
          previo !== undefined && previo.objetoId === objeto.id
            ? previo
            : { objetoId: objeto.id, valores: {}, eliminados: [] as readonly string[] };
        const valoresRestantes = { ...vigente.valores };
        delete valoresRestantes[clave];
        return {
          ...vigente,
          valores: valoresRestantes,
          eliminados: [...new Set([...vigente.eliminados, clave])],
        };
      });
      setGuardadoEn(undefined);
    },
    [objeto.id],
  );

  const agregarLibre = useCallback(() => {
    const clave = nuevaClave.trim();
    if (clave === "") {
      return;
    }
    actualizar(clave, nuevoValor);
    setNuevaClave("");
    setNuevoValor("");
  }, [actualizar, nuevaClave, nuevoValor]);

  const guardarAtributos = useCallback(() => {
    if (!puedeGuardar) {
      return;
    }
    guardar.mutate(deseados, {
      onSuccess: () => {
        setBorrador(undefined);
        setGuardadoEn(objeto.id);
      },
    });
  }, [deseados, guardar, objeto.id, puedeGuardar]);

  const estado = guardando
    ? t("page.objeto.attributes.saving")
    : conCambios
      ? t("page.objeto.attributes.unsaved")
      : guardadoEn === objeto.id
        ? t("page.objeto.attributes.saved")
        : t("page.objeto.attributes.clean");

  return (
    <section
      aria-label={t("page.objeto.attributes.title")}
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sheet"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-heading text-lg font-medium">{t("page.objeto.attributes.title")}</h2>
          {crudo ? (
            <span className="text-xs text-muted-foreground">{t("page.objeto.attributes.raw")}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {estado}
          </p>
          <Button
            type="button"
            size="sm"
            onClick={guardarAtributos}
            disabled={!puedeGuardar}
            title={t("page.objeto.attributes.save")}
          >
            <Save aria-hidden="true" />
            {guardando ? t("page.objeto.attributes.saving") : t("page.objeto.attributes.save")}
          </Button>
        </div>
      </header>

      {guardar.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-destructive/5 px-4 py-2.5 text-sm text-destructive"
        >
          <p className="max-w-prose">
            <span className="font-medium">{t("page.objeto.attributes.saveError")}. </span>
            {guardar.error instanceof ApiError ? guardar.error.mensaje : t("error.genericError")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={guardarAtributos}
            disabled={guardando}
          >
            {t("page.objeto.retry")}
          </Button>
        </div>
      ) : null}

      {filas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          {t("page.objeto.attributes.empty")}
        </p>
      ) : (
        <div className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((fila) => {
            const etiquetaId = `atributo-etiqueta-${fila.clave}`;
            return (
              <div key={fila.clave} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex min-h-5 items-center justify-between gap-2">
                  <label
                    id={etiquetaId}
                    htmlFor={`atributo-${fila.clave}`}
                    className="truncate text-xs font-medium text-muted-foreground"
                  >
                    {fila.definicion?.nombre ?? fila.clave}
                  </label>
                  {esObligatorio(fila.definicion) ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("page.objeto.attributes.remove", { clave: fila.clave })}
                      disabled={guardando}
                      onClick={() => eliminar(fila.clave)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <EditorValor
                  editorId={`atributo-${fila.clave}`}
                  etiquetaId={etiquetaId}
                  definicion={fila.definicion}
                  valor={fila.valor}
                  crudo={crudo}
                  deshabilitado={guardando}
                  onCambio={(valor) => actualizar(fila.clave, valor)}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-border/70 bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="atributo-nuevo-clave"
            className="text-xs font-medium text-muted-foreground"
          >
            {t("page.objeto.attributes.key")}
          </label>
          <Input
            id="atributo-nuevo-clave"
            className="h-8 w-40"
            value={nuevaClave}
            placeholder={t("page.objeto.attributes.keyPlaceholder")}
            onChange={(evento) => setNuevaClave(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="atributo-nuevo-valor"
            className="text-xs font-medium text-muted-foreground"
          >
            {t("page.objeto.attributes.value")}
          </label>
          <Input
            id="atributo-nuevo-valor"
            className="h-8 w-56"
            value={nuevoValor}
            placeholder={t("page.objeto.attributes.valuePlaceholder")}
            onChange={(evento) => setNuevoValor(evento.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={nuevaClave.trim() === "" || guardando}
          onClick={agregarLibre}
        >
          <Plus aria-hidden="true" />
          {t("page.objeto.attributes.add")}
        </Button>
      </div>
    </section>
  );
};
