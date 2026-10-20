import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

const ANCHO_MINIMO_ESCRITORIO = 1024;

const leerAbierta = (clave: string): boolean => {
  try {
    const guardado = localStorage.getItem(clave);
    if (guardado === "abierto") {
      return true;
    }
    if (guardado === "cerrado") {
      return false;
    }
  } catch {
    return true;
  }
  return typeof window === "undefined" || window.innerWidth >= ANCHO_MINIMO_ESCRITORIO;
};

const guardarAbierta = (clave: string, abierta: boolean): void => {
  try {
    localStorage.setItem(clave, abierta ? "abierto" : "cerrado");
  } catch {
    return;
  }
};

export type EstadoBarraSecundaria = {
  readonly abierta: boolean;
  readonly abrir: () => void;
  readonly colapsar: () => void;
};

export const useBarraSecundaria = (clave: string): EstadoBarraSecundaria => {
  const [abierta, setAbierta] = useState<boolean>(() => leerAbierta(clave));

  const abrir = useCallback(() => {
    setAbierta(true);
    guardarAbierta(clave, true);
  }, [clave]);

  const colapsar = useCallback(() => {
    setAbierta(false);
    guardarAbierta(clave, false);
  }, [clave]);

  return { abierta, abrir, colapsar };
};

type BarraSecundariaProps = {
  readonly titulo: string;
  readonly etiquetaAbrir: string;
  readonly etiquetaColapsar: string;
  readonly abierta: boolean;
  readonly onAbrir: () => void;
  readonly onColapsar: () => void;
  readonly children: ReactNode;
};

export const BarraSecundaria = ({
  titulo,
  etiquetaAbrir,
  etiquetaColapsar,
  abierta,
  onAbrir,
  onColapsar,
  children,
}: BarraSecundariaProps) => {
  if (!abierta) {
    return (
      <button
        type="button"
        aria-label={etiquetaAbrir}
        onClick={onAbrir}
        className="flex items-center gap-2 border-sidebar-border border-b bg-sidebar px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none lg:h-full lg:w-12 lg:flex-col lg:justify-start lg:gap-0 lg:border-r lg:border-b-0 lg:px-0 lg:pt-4"
      >
        <PanelLeftOpen aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="lg:hidden">{etiquetaAbrir}</span>
      </button>
    );
  }

  return (
    <aside
      aria-label={titulo}
      className="flex min-h-0 flex-col border-sidebar-border border-r bg-sidebar max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:w-80 max-lg:max-w-[85vw] max-lg:shadow-sheet"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-border/70 border-b px-3 py-2">
        <h2 className="font-heading text-sm font-medium">{titulo}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={etiquetaColapsar}
          onClick={onColapsar}
        >
          <PanelLeftClose aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
};
