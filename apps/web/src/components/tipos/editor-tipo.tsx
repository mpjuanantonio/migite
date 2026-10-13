import type { FieldTypeWire, TipoPayload } from "@migite/contracts";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useActualizarTipo, useBorrarTipo, useCrearTipo } from "@/api/hooks";
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
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import {
  type AtributoBorrador,
  atributoValido,
  borradoresDe,
  esTipoConOpciones,
  FIELD_TYPES,
  hayIdsDuplicados,
  idValido,
  nuevoAtributo,
  type PresentacionBorrador,
  payloadDeAtributo,
  payloadDePresentacion,
  presentacionInicial,
  sugerirId,
} from "@/lib/tipos";

const ETIQUETAS_TIPO_CAMPO: Record<FieldTypeWire, AppTranslationKey> = {
  texto: "page.tipo.fieldType.texto",
  numero: "page.tipo.fieldType.numero",
  fecha: "page.tipo.fieldType.fecha",
  "fecha-hora": "page.tipo.fieldType.fecha-hora",
  booleano: "page.tipo.fieldType.booleano",
  seleccion: "page.tipo.fieldType.seleccion",
  "multi-seleccion": "page.tipo.fieldType.multi-seleccion",
  url: "page.tipo.fieldType.url",
  referencia: "page.tipo.fieldType.referencia",
  archivo: "page.tipo.fieldType.archivo",
};

const ESTILO_CAMPO =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

const ESTILO_ETIQUETA = "text-xs font-medium text-muted-foreground";

const nombreVisible = (borrador: AtributoBorrador, vacio: string): string =>
  borrador.nombre.trim() === ""
    ? borrador.id.trim() === ""
      ? vacio
      : borrador.id.trim()
    : borrador.nombre.trim();

type FilaAtributoProps = {
  readonly borrador: AtributoBorrador;
  readonly soloLectura: boolean;
  readonly onCambio: (siguiente: AtributoBorrador) => void;
  readonly onQuitar: () => void;
};

const FilaAtributo = ({ borrador, soloLectura, onCambio, onQuitar }: FilaAtributoProps) => {
  const { t } = useI18n();
  const existente = borrador.original !== undefined;
  const bloqueado = soloLectura || existente;
  const base = `tipo-atributo-${borrador.clave}`;

  return (
    <li className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-id`} className={ESTILO_ETIQUETA}>
          {t("page.tipo.attributeId")}
        </label>
        <Input
          id={`${base}-id`}
          value={borrador.id}
          disabled={bloqueado}
          onChange={(evento) => onCambio({ ...borrador, id: evento.target.value, idManual: true })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-nombre`} className={ESTILO_ETIQUETA}>
          {t("page.tipo.attributeName")}
        </label>
        <Input
          id={`${base}-nombre`}
          value={borrador.nombre}
          disabled={soloLectura}
          onChange={(evento) => {
            const nombre = evento.target.value;
            onCambio({
              ...borrador,
              nombre,
              ...(!existente && !borrador.idManual ? { id: sugerirId(nombre) } : {}),
            });
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${base}-tipo`} className={ESTILO_ETIQUETA}>
          {t("page.tipo.attributeType")}
        </label>
        <select
          id={`${base}-tipo`}
          className={ESTILO_CAMPO}
          value={borrador.tipo}
          disabled={bloqueado}
          title={existente ? t("page.tipo.existingLocked") : undefined}
          onChange={(evento) =>
            onCambio({ ...borrador, tipo: evento.target.value as FieldTypeWire })
          }
        >
          {FIELD_TYPES.map((tipo) => (
            <option key={tipo} value={tipo}>
              {t(ETIQUETAS_TIPO_CAMPO[tipo])}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 md:pb-1.5">
        <Switch
          id={`${base}-obligatorio`}
          checked={borrador.obligatorio}
          disabled={soloLectura}
          onCheckedChange={(marcado) => onCambio({ ...borrador, obligatorio: marcado })}
        />
        <label htmlFor={`${base}-obligatorio`} className={ESTILO_ETIQUETA}>
          {t("page.tipo.attributeRequired")}
        </label>
        {soloLectura ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-1"
            aria-label={t("page.tipo.removeAttribute", {
              nombre: nombreVisible(borrador, t("page.tipo.newAttribute")),
            })}
            onClick={onQuitar}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
      {esTipoConOpciones(borrador.tipo) ? (
        <div className="flex flex-col gap-1.5 md:col-span-4">
          <label htmlFor={`${base}-opciones`} className={ESTILO_ETIQUETA}>
            {t("page.tipo.attributeOptions")}
          </label>
          <Input
            id={`${base}-opciones`}
            value={borrador.opciones}
            disabled={soloLectura}
            placeholder="a, b, c"
            onChange={(evento) => onCambio({ ...borrador, opciones: evento.target.value })}
          />
        </div>
      ) : null}
    </li>
  );
};

export type EditorTipoProps = {
  readonly tipo?: TipoPayload;
  readonly soloLectura?: boolean;
};

export const EditorTipo = ({ tipo, soloLectura = false }: EditorTipoProps) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const esNuevo = tipo === undefined;
  const crear = useCrearTipo();
  const actualizar = useActualizarTipo(tipo?.id ?? "");
  const borrar = useBorrarTipo();
  const contador = useRef(0);
  const [nombre, setNombre] = useState(tipo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(tipo?.descripcion ?? "");
  const [idEscrito, setIdEscrito] = useState("");
  const [idManual, setIdManual] = useState(false);
  const [atributos, setAtributos] = useState<readonly AtributoBorrador[]>(() => borradoresDe(tipo));
  const [presentacion, setPresentacion] = useState<PresentacionBorrador>(() =>
    presentacionInicial(tipo),
  );
  const [aQuitar, setAQuitar] = useState<AtributoBorrador>();
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const id = esNuevo ? (idManual ? idEscrito : sugerirId(nombre)) : (tipo?.id ?? "");
  const mutacion = esNuevo ? crear : actualizar;
  const idsRepetidos = hayIdsDuplicados(atributos);
  const camposValidos =
    nombre.trim() !== "" && idValido(id) && !idsRepetidos && atributos.every(atributoValido);
  const puedeGuardar = !soloLectura && camposValidos && !mutacion.isPending;

  const actualizarAtributo = (clave: string, siguiente: AtributoBorrador) => {
    setAtributos((previos) =>
      previos.map((borrador) => (borrador.clave === clave ? siguiente : borrador)),
    );
    setGuardado(false);
  };

  const agregarAtributo = () => {
    contador.current += 1;
    setAtributos((previos) => [...previos, nuevoAtributo(`nuevo-${contador.current}`)]);
    setGuardado(false);
  };

  const confirmarQuitar = () => {
    if (aQuitar === undefined) {
      return;
    }
    setAtributos((previos) => previos.filter((borrador) => borrador.clave !== aQuitar.clave));
    setAQuitar(undefined);
    setGuardado(false);
  };

  const guardarCambios = () => {
    if (!puedeGuardar) {
      return;
    }
    const atributosPayload = atributos.map(payloadDeAtributo);
    const presentacionPayload = payloadDePresentacion(presentacion);
    const limpia = descripcion.trim();
    if (esNuevo) {
      crear.mutate(
        {
          id: id.trim(),
          nombre: nombre.trim(),
          ...(limpia === "" ? {} : { descripcion: limpia }),
          atributos: atributosPayload,
          presentacion: presentacionPayload,
        },
        {
          onSuccess: (creado) => {
            navigate(`/tipos/${encodeURIComponent(creado.id)}`);
          },
        },
      );
      return;
    }
    actualizar.mutate(
      {
        nombre: nombre.trim(),
        ...(limpia === "" && tipo.descripcion === undefined ? {} : { descripcion: limpia }),
        atributos: atributosPayload,
        presentacion: presentacionPayload,
      },
      { onSuccess: () => setGuardado(true) },
    );
  };

  const confirmarBorrar = () => {
    if (tipo === undefined || borrar.isPending) {
      return;
    }
    borrar.mutate(tipo.id, {
      onSuccess: () => {
        setBorrarAbierto(false);
        navigate("/tipos");
      },
    });
  };

  const errorGuardado = mutacion.isError
    ? mutacion.error instanceof ApiError
      ? mutacion.error.mensaje
      : t("error.genericError")
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm" className="-ml-2.5">
              <Link to="/tipos">
                <ArrowLeft aria-hidden="true" />
                {t("page.tipo.back")}
              </Link>
            </Button>
            <h1 className="mt-2 font-heading text-display font-medium break-words">
              {esNuevo ? t("page.tipo.newTitle") : t("page.tipo.editTitle")}
            </h1>
            {soloLectura ? null : (
              <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                {t("page.tipos.description")}
              </p>
            )}
          </div>
        </div>
        {soloLectura ? (
          <p
            role="status"
            className="max-w-prose rounded-md border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground"
          >
            {t("page.tipo.systemNotice")}
          </p>
        ) : null}
      </header>

      <section
        aria-label={esNuevo ? t("page.tipo.newTitle") : t("page.tipo.editTitle")}
        className="rounded-lg border border-border bg-card px-5 py-4 shadow-sheet"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo-id" className={ESTILO_ETIQUETA}>
              {t("page.tipo.idLabel")}
            </label>
            <Input
              id="tipo-id"
              value={id}
              disabled={!esNuevo || soloLectura}
              aria-invalid={id.trim() !== "" && !idValido(id)}
              onChange={(evento) => {
                setIdEscrito(evento.target.value);
                setIdManual(true);
                setGuardado(false);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("page.tipo.idHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tipo-nombre" className={ESTILO_ETIQUETA}>
              {t("page.tipo.nameLabel")}
            </label>
            <Input
              id="tipo-nombre"
              value={nombre}
              disabled={soloLectura}
              onChange={(evento) => {
                setNombre(evento.target.value);
                setGuardado(false);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="tipo-descripcion" className={ESTILO_ETIQUETA}>
              {t("page.tipo.descriptionLabel")}
            </label>
            <textarea
              id="tipo-descripcion"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
              value={descripcion}
              disabled={soloLectura}
              onChange={(evento) => {
                setDescripcion(evento.target.value);
                setGuardado(false);
              }}
            />
          </div>
        </div>
      </section>

      {soloLectura ? null : (
        <section
          aria-label={t("page.tipo.presentation")}
          className="rounded-lg border border-border bg-card shadow-sheet"
        >
          <header className="border-b border-border/70 px-4 py-3">
            <h2 className="font-heading text-lg font-medium">{t("page.tipo.presentation")}</h2>
          </header>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tipo-presentacion-seccion" className={ESTILO_ETIQUETA}>
                {t("page.tipo.presentationSection")}
              </label>
              <select
                id="tipo-presentacion-seccion"
                className={ESTILO_CAMPO}
                value={presentacion.seccion}
                onChange={(evento) => {
                  setPresentacion({
                    ...presentacion,
                    seccion: evento.target.value as PresentacionBorrador["seccion"],
                  });
                  setGuardado(false);
                }}
              >
                <option value="">{t("page.tipo.presentationSectionNone")}</option>
                <option value="notas">{t("page.tipo.presentationSectionNotas")}</option>
                <option value="productividad">
                  {t("page.tipo.presentationSectionProductividad")}
                </option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tipo-presentacion-carpeta" className={ESTILO_ETIQUETA}>
                {t("page.tipo.presentationFolder")}
              </label>
              <Input
                id="tipo-presentacion-carpeta"
                value={presentacion.carpeta}
                placeholder={t("page.tipo.presentationFolderPlaceholder")}
                onChange={(evento) => {
                  setPresentacion({ ...presentacion, carpeta: evento.target.value });
                  setGuardado(false);
                }}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="tipo-presentacion-visible"
                checked={presentacion.visible}
                onCheckedChange={(marcado) => {
                  setPresentacion({ ...presentacion, visible: marcado });
                  setGuardado(false);
                }}
              />
              <label htmlFor="tipo-presentacion-visible" className={ESTILO_ETIQUETA}>
                {t("page.tipo.presentationVisible")}
              </label>
            </div>
          </div>
        </section>
      )}

      <section
        aria-label={t("page.tipo.attributes")}
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sheet"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/70 px-4 py-3">
          <h2 className="font-heading text-lg font-medium">{t("page.tipo.attributes")}</h2>
          {soloLectura ? null : (
            <Button type="button" variant="outline" size="sm" onClick={agregarAtributo}>
              <Plus aria-hidden="true" />
              {t("page.tipo.addAttribute")}
            </Button>
          )}
        </header>

        {atributos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {t("page.tipo.attributesEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {atributos.map((borrador) => (
              <FilaAtributo
                key={borrador.clave}
                borrador={borrador}
                soloLectura={soloLectura}
                onCambio={(siguiente) => actualizarAtributo(borrador.clave, siguiente)}
                onQuitar={() => setAQuitar(borrador)}
              />
            ))}
          </ul>
        )}

        {soloLectura ? null : (
          <p className="border-t border-border/70 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            {t("page.tipo.existingLocked")}
          </p>
        )}
      </section>

      {idsRepetidos || (id.trim() !== "" && !idValido(id)) ? (
        <p role="alert" className="text-sm text-destructive">
          {idsRepetidos ? t("page.tipo.duplicateIds") : t("page.tipo.invalidId")}
        </p>
      ) : null}

      {errorGuardado === undefined ? null : (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
        >
          <span className="font-medium">
            {esNuevo ? t("page.tipo.createError") : t("page.tipo.saveError")}.{" "}
          </span>
          {errorGuardado}
        </div>
      )}

      {soloLectura ? null : (
        <footer className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {guardado ? t("page.tipo.saved") : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {esNuevo ? null : (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  borrar.reset();
                  setBorrarAbierto(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t("page.tipo.delete")}
              </Button>
            )}
            <Button type="button" disabled={!puedeGuardar} onClick={guardarCambios}>
              <Save aria-hidden="true" />
              {esNuevo
                ? crear.isPending
                  ? t("page.tipo.creating")
                  : t("page.tipo.create")
                : actualizar.isPending
                  ? t("page.tipo.saving")
                  : t("page.tipo.save")}
            </Button>
          </div>
        </footer>
      )}

      <Dialog
        open={aQuitar !== undefined}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setAQuitar(undefined);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("page.tipo.removeTitle", {
                nombre: aQuitar === undefined ? "" : nombreVisible(aQuitar, ""),
              })}
            </DialogTitle>
            <DialogDescription>{t("page.tipo.removeWarning")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("page.tipo.removeCancel")}
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={confirmarQuitar}>
              {t("page.tipo.removeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={borrarAbierto} onOpenChange={setBorrarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("page.tipo.deleteTitle", { nombre: tipo?.nombre ?? "" })}</DialogTitle>
            <DialogDescription>{t("page.tipo.deleteWarning")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("page.tipo.deleteNotice")}</p>
          {borrar.isError ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
            >
              <span className="font-medium">{t("page.tipo.deleteError")}. </span>
              {borrar.error instanceof ApiError ? borrar.error.mensaje : t("error.genericError")}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={borrar.isPending}>
                {t("page.tipo.deleteCancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={borrar.isPending}
              onClick={confirmarBorrar}
            >
              {borrar.isPending ? t("page.tipo.deleteDeleting") : t("page.tipo.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
