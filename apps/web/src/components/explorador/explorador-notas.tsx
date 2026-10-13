import type { ArbolObjetoNode } from "@migite/contracts";
import { ChevronRight, FileText, Folder, FolderOpen, PanelLeftClose, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useArbolObjetos, useTipos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { esTipoDeSeccionNotas } from "@/lib/tipos";
import { cn } from "@/lib/utils";
import { ancestrosDe, type CarpetaArbol, construirArbol } from "./arbol";

export const EXPLORADOR_EXPANDIDAS_KEY = "migite.explorador.expandidas";

const leerExpandidas = (): readonly string[] | null => {
  try {
    const crudo = localStorage.getItem(EXPLORADOR_EXPANDIDAS_KEY);
    if (crudo === null) {
      return null;
    }
    const valor: unknown = JSON.parse(crudo);
    if (!Array.isArray(valor)) {
      return null;
    }
    return valor.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
};

const guardarExpandidas = (rutas: ReadonlySet<string>): void => {
  try {
    localStorage.setItem(EXPLORADOR_EXPANDIDAS_KEY, JSON.stringify([...rutas]));
  } catch {
    return;
  }
};

type FilaNotaProps = {
  readonly nota: ArbolObjetoNode;
  readonly nivel: number;
  readonly seleccionada: boolean;
};

const FilaNota = ({ nota, nivel, seleccionada }: FilaNotaProps) => (
  <li>
    <Link
      to={`/objetos/${encodeURIComponent(nota.id)}`}
      aria-current={seleccionada ? "page" : undefined}
      style={{ paddingInlineStart: `${0.5 + nivel * 0.85}rem` }}
      className={cn(
        "flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        seleccionada
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
      )}
    >
      <FileText aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{nota.titulo}</span>
    </Link>
  </li>
);

type RamaCarpetaProps = {
  readonly carpeta: CarpetaArbol;
  readonly nivel: number;
  readonly expandidas: ReadonlySet<string>;
  readonly carpetaSeleccionada?: string | undefined;
  readonly idSeleccionado?: string | undefined;
  readonly onAlternar: (ruta: string) => void;
  readonly onSeleccionar: (ruta: string) => void;
};

const RamaCarpeta = ({
  carpeta,
  nivel,
  expandidas,
  carpetaSeleccionada,
  idSeleccionado,
  onAlternar,
  onSeleccionar,
}: RamaCarpetaProps) => {
  const { t } = useI18n();
  const abierta = expandidas.has(carpeta.ruta);
  const seleccionada = carpetaSeleccionada === carpeta.ruta;

  return (
    <li>
      <div className="flex items-center" style={{ paddingInlineStart: `${nivel * 0.85}rem` }}>
        <button
          type="button"
          aria-expanded={abierta}
          aria-label={
            abierta
              ? t("explorador.collapseFolder", { carpeta: carpeta.nombre })
              : t("explorador.expandFolder", { carpeta: carpeta.nombre })
          }
          onClick={() => onAlternar(carpeta.ruta)}
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn("size-3.5 transition-transform", abierta && "rotate-90")}
          />
        </button>
        <button
          type="button"
          aria-current={seleccionada ? "true" : undefined}
          onClick={() => onSeleccionar(carpeta.ruta)}
          title={carpeta.ruta}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 pl-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            seleccionada
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          {abierta ? (
            <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
          ) : (
            <Folder aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
          )}
          <span className="truncate">{carpeta.nombre}</span>
          {carpeta.total > 0 ? (
            <span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">
              {carpeta.total}
            </span>
          ) : null}
        </button>
      </div>
      {abierta && (carpeta.carpetas.length > 0 || carpeta.notas.length > 0) ? (
        <ul className="flex flex-col gap-0.5">
          {carpeta.carpetas.map((hija) => (
            <RamaCarpeta
              key={hija.ruta}
              carpeta={hija}
              nivel={nivel + 1}
              expandidas={expandidas}
              carpetaSeleccionada={carpetaSeleccionada}
              idSeleccionado={idSeleccionado}
              onAlternar={onAlternar}
              onSeleccionar={onSeleccionar}
            />
          ))}
          {carpeta.notas.map((nota) => (
            <FilaNota
              key={nota.id}
              nota={nota}
              nivel={nivel + 1}
              seleccionada={nota.id === idSeleccionado}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export type ExploradorNotasProps = {
  readonly idSeleccionado?: string | undefined;
  readonly carpetaSeleccionada?: string | undefined;
  readonly onSeleccionarCarpeta?: ((carpeta: string | undefined) => void) | undefined;
  readonly onColapsar?: (() => void) | undefined;
};

export const ExploradorNotas = ({
  idSeleccionado,
  carpetaSeleccionada,
  onSeleccionarCarpeta,
  onColapsar,
}: ExploradorNotasProps) => {
  const { t, locale } = useI18n();
  const tipos = useTipos();
  const consulta = useArbolObjetos();
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(() => {
    const guardadas = leerExpandidas();
    if (guardadas !== null) {
      return new Set(guardadas);
    }
    if (carpetaSeleccionada === undefined || carpetaSeleccionada === "") {
      return new Set();
    }
    return new Set(ancestrosDe(carpetaSeleccionada));
  });
  const seleccionAnterior = useRef(carpetaSeleccionada);

  const idsNotas = useMemo(() => {
    if (tipos.data === undefined) {
      return new Set<string>(["nota"]);
    }
    const ids = new Set(
      tipos.data.filter((tipo) => esTipoDeSeccionNotas(tipo)).map((tipo) => tipo.id),
    );
    ids.add("nota");
    return ids;
  }, [tipos.data]);

  const arbol = useMemo(
    () =>
      construirArbol(
        (consulta.data?.nodos ?? []).filter((nodo) => idsNotas.has(nodo.tipo)),
        locale,
      ),
    [consulta.data, idsNotas, locale],
  );

  useEffect(() => {
    if (seleccionAnterior.current === carpetaSeleccionada) {
      return;
    }
    seleccionAnterior.current = carpetaSeleccionada;
    if (carpetaSeleccionada === undefined || carpetaSeleccionada === "") {
      return;
    }
    const necesarias = ancestrosDe(carpetaSeleccionada).filter((ruta) => !expandidas.has(ruta));
    if (necesarias.length === 0) {
      return;
    }
    const siguientes = new Set([...expandidas, ...necesarias]);
    setExpandidas(siguientes);
    guardarExpandidas(siguientes);
  }, [carpetaSeleccionada, expandidas]);

  const alternar = (ruta: string): void => {
    const siguientes = new Set(expandidas);
    if (siguientes.has(ruta)) {
      siguientes.delete(ruta);
    } else {
      siguientes.add(ruta);
    }
    setExpandidas(siguientes);
    guardarExpandidas(siguientes);
  };

  const seleccionarCarpeta = (ruta: string | undefined): void => {
    onSeleccionarCarpeta?.(ruta);
  };

  return (
    <nav
      aria-label={t("explorador.title")}
      className="flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sheet lg:max-h-[calc(100vh-6rem)]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <h2 className="font-heading text-sm font-medium">{t("explorador.title")}</h2>
        {onColapsar === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("explorador.collapse")}
            onClick={onColapsar}
          >
            <PanelLeftClose aria-hidden="true" />
          </Button>
        )}
      </header>

      <div className="border-b border-border/70 px-2 py-1.5">
        <button
          type="button"
          aria-pressed={carpetaSeleccionada === undefined}
          onClick={() => seleccionarCarpeta(undefined)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            carpetaSeleccionada === undefined
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
          )}
        >
          <FileText aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
          {t("page.notas.allFolders")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {consulta.isPending ? (
          <p role="status" className="px-1 py-1.5 text-sm text-muted-foreground">
            {t("explorador.loading")}
          </p>
        ) : null}

        {consulta.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2 px-1 py-1.5">
            <p className="text-sm font-medium text-destructive">{t("explorador.loadError")}</p>
            <p className="text-sm text-muted-foreground">
              {consulta.error instanceof ApiError
                ? consulta.error.mensaje
                : t("error.genericError")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void consulta.refetch()}
            >
              <RotateCw aria-hidden="true" />
              {t("explorador.retry")}
            </Button>
          </div>
        ) : null}

        {consulta.isSuccess && arbol.total === 0 ? (
          <p className="px-1 py-1.5 text-sm text-muted-foreground">{t("explorador.empty")}</p>
        ) : null}

        {consulta.isSuccess && arbol.total > 0 ? (
          <ul aria-label={t("explorador.tree")} className="flex flex-col gap-0.5">
            <li>
              <button
                type="button"
                aria-current={carpetaSeleccionada === "" ? "true" : undefined}
                onClick={() => seleccionarCarpeta("")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  carpetaSeleccionada === ""
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                <Folder aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                <span>{t("explorador.root")}</span>
                <span aria-hidden="true" className="ml-auto text-xs text-muted-foreground">
                  {arbol.total}
                </span>
              </button>
              <ul className="flex flex-col gap-0.5">
                {arbol.carpetas.map((carpeta) => (
                  <RamaCarpeta
                    key={carpeta.ruta}
                    carpeta={carpeta}
                    nivel={1}
                    expandidas={expandidas}
                    carpetaSeleccionada={carpetaSeleccionada}
                    idSeleccionado={idSeleccionado}
                    onAlternar={alternar}
                    onSeleccionar={seleccionarCarpeta}
                  />
                ))}
                {arbol.notas.map((nota) => (
                  <FilaNota
                    key={nota.id}
                    nota={nota}
                    nivel={1}
                    seleccionada={nota.id === idSeleccionado}
                  />
                ))}
              </ul>
            </li>
          </ul>
        ) : null}
      </div>
    </nav>
  );
};
