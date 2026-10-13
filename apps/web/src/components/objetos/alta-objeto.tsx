import type { AttributePayload } from "@migite/contracts";
import { useId, useMemo, useState } from "react";
import { ApiError } from "@/api/api";
import { useCrearObjeto, useTipos } from "@/api/hooks";
import { CampoAtributo } from "@/components/atributos/campo-atributo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import { atributosDeAlta, valoresInicialesDeAlta } from "@/lib/altas";
import { aWire, esVacio, filtrarVacios } from "@/lib/atributos";
import { esTipoSistema } from "@/lib/tipos";

const ESTILO_SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

const faltaObligatorio = (atributo: AttributePayload, valor: unknown): boolean =>
  atributo.obligatorio &&
  (esVacio(valor) || valor === "" || (Array.isArray(valor) && valor.length === 0));

export type AltaObjetoDialogProps = {
  readonly tipoInicial?: string;
  readonly tipoFijo?: boolean;
  readonly enlacesIniciales?: readonly string[];
  readonly carpetaInicial?: string;
  readonly carpetasConocidas?: readonly string[];
  readonly onCerrar: () => void;
  readonly onCreado: (id: string) => void;
};

export const AltaObjetoDialog = ({
  tipoInicial,
  tipoFijo = false,
  enlacesIniciales,
  carpetaInicial,
  carpetasConocidas,
  onCerrar,
  onCreado,
}: AltaObjetoDialogProps) => {
  const { t } = useI18n();
  const tipos = useTipos();
  const crear = useCrearObjeto();
  const campoId = useId();
  const [tipoId, setTipoId] = useState(tipoInicial ?? "");
  const [titulo, setTitulo] = useState("");
  const [carpeta, setCarpeta] = useState(carpetaInicial ?? "");
  const [valores, setValores] = useState<Readonly<Record<string, unknown>>>({});
  const [aviso, setAviso] = useState("");

  const tipo = tipos.data?.find((item) => item.id === tipoId);
  const definiciones = useMemo(() => tipo?.atributos ?? [], [tipo]);
  const atributos = useMemo(() => atributosDeAlta(tipoId, definiciones), [tipoId, definiciones]);
  const valoresEfectivos = useMemo(
    () => ({ ...valoresInicialesDeAlta(tipoId), ...valores }),
    [tipoId, valores],
  );

  const atributosWire = useMemo(
    () =>
      filtrarVacios(
        Object.fromEntries(
          definiciones.map((atributo) => [
            atributo.id,
            aWire(atributo.tipo, valoresEfectivos[atributo.id]),
          ]),
        ),
      ),
    [definiciones, valoresEfectivos],
  );

  const obligatoriosVacios = atributos.some((atributo) =>
    faltaObligatorio(atributo, atributosWire[atributo.id]),
  );

  const ocultarTipo = tipoFijo && tipoInicial !== undefined;

  const enviar = () => {
    const limpio = titulo.trim();
    if (tipo === undefined || crear.isPending) {
      return;
    }
    if (limpio === "") {
      setAviso(t("altas.objeto.missingTitle"));
      return;
    }
    if (obligatoriosVacios) {
      setAviso(t("altas.objeto.missingRequired"));
      return;
    }
    setAviso("");
    crear.mutate(
      {
        tipo: tipo.id,
        titulo: limpio,
        ...(Object.keys(atributosWire).length === 0 ? {} : { atributos: atributosWire }),
        ...(carpeta.trim() === "" ? {} : { carpeta: carpeta.trim() }),
        ...(enlacesIniciales === undefined || enlacesIniciales.length === 0
          ? {}
          : { enlaces: [...enlacesIniciales] }),
      },
      {
        onSuccess: (objeto) => {
          onCreado(objeto.id);
        },
      },
    );
  };

  const errorApi = crear.error;
  const mensajeError = errorApi instanceof ApiError ? errorApi.mensaje : t("error.genericError");

  return (
    <Dialog open onOpenChange={(siguiente) => (siguiente ? undefined : onCerrar())}>
      <DialogContent className="max-h-[calc(100%-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("altas.objeto.title")}</DialogTitle>
          <DialogDescription>{t("altas.objeto.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            enviar();
          }}
        >
          {ocultarTipo ? null : (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`${campoId}-tipo`}
                className="text-xs font-medium text-muted-foreground"
              >
                {t("altas.objeto.typeLabel")}
              </label>
              {tipos.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("altas.objeto.typesLoading")}
                </p>
              ) : null}
              {tipos.isError ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
                >
                  <span className="font-medium">{t("altas.objeto.typesError")}. </span>
                  {tipos.error instanceof ApiError ? tipos.error.mensaje : t("error.genericError")}
                </div>
              ) : null}
              {tipos.isSuccess ? (
                <select
                  id={`${campoId}-tipo`}
                  className={ESTILO_SELECT}
                  value={tipoId}
                  disabled={crear.isPending}
                  onChange={(evento) => {
                    setTipoId(evento.target.value);
                    setValores({});
                    setAviso("");
                  }}
                >
                  <option value="">{t("altas.objeto.typePlaceholder")}</option>
                  {tipos.data.map((item) => (
                    <option key={item.id} value={item.id}>
                      {esTipoSistema(item.id)
                        ? t("altas.objeto.typeSystemOption", { nombre: item.nombre })
                        : item.nombre}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${campoId}-titulo`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t("altas.objeto.titleLabel")}
            </label>
            <Input
              id={`${campoId}-titulo`}
              value={titulo}
              disabled={crear.isPending}
              onChange={(evento) => {
                setTitulo(evento.target.value);
                setAviso("");
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${campoId}-carpeta`}
              className="text-xs font-medium text-muted-foreground"
            >
              {t("altas.objeto.folderLabel")}
            </label>
            <Input
              id={`${campoId}-carpeta`}
              list={
                carpetasConocidas === undefined || carpetasConocidas.length === 0
                  ? undefined
                  : `${campoId}-carpetas`
              }
              value={carpeta}
              disabled={crear.isPending}
              onChange={(evento) => setCarpeta(evento.target.value)}
            />
            {carpetasConocidas !== undefined && carpetasConocidas.length > 0 ? (
              <datalist id={`${campoId}-carpetas`}>
                {carpetasConocidas.map((nombre) => (
                  <option key={nombre} value={nombre} />
                ))}
              </datalist>
            ) : null}
          </div>

          {tipo !== undefined && atributos.length > 0 ? (
            <div className="grid gap-x-6 gap-y-4 border-t border-border/70 pt-4 sm:grid-cols-2">
              {atributos.map((atributo) => {
                const etiquetaId = `${campoId}-etiqueta-${atributo.id}`;
                return (
                  <div key={atributo.id} className="flex min-w-0 flex-col gap-1.5">
                    <label
                      id={etiquetaId}
                      htmlFor={`${campoId}-${atributo.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
                    >
                      {atributo.nombre}
                      {atributo.obligatorio ? (
                        <span aria-hidden="true" className="text-destructive">
                          *
                        </span>
                      ) : null}
                    </label>
                    <CampoAtributo
                      editorId={`${campoId}-${atributo.id}`}
                      etiquetaId={etiquetaId}
                      definicion={atributo}
                      valor={valoresEfectivos[atributo.id]}
                      crudo={false}
                      deshabilitado={crear.isPending}
                      onCambio={(valor) => {
                        setValores((previos) => ({ ...previos, [atributo.id]: valor }));
                        setAviso("");
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {aviso !== "" ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              {aviso}
            </div>
          ) : null}

          {crear.isError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              <span className="font-medium">{t("altas.objeto.createError")}. </span>
              {mensajeError}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={crear.isPending}>
                {t("altas.objeto.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={tipo === undefined || crear.isPending}>
              {crear.isPending ? t("altas.objeto.creating") : t("altas.objeto.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
