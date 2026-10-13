import { PanelLeftOpen } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { ExploradorNotas } from "./explorador-notas";

export const EXPLORADOR_PANEL_KEY = "migite.explorador";

const ANCHO_MINIMO_ESCRITORIO = 1024;

const leerPanelAbierto = (): boolean => {
  try {
    const guardado = localStorage.getItem(EXPLORADOR_PANEL_KEY);
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

const guardarPanelAbierto = (abierto: boolean): void => {
  try {
    localStorage.setItem(EXPLORADOR_PANEL_KEY, abierto ? "abierto" : "cerrado");
  } catch {
    return;
  }
};

type DisposicionExploradorProps = {
  readonly idSeleccionado?: string | undefined;
  readonly carpetaSeleccionada?: string | undefined;
  readonly onSeleccionarCarpeta?: ((carpeta: string | undefined) => void) | undefined;
  readonly children: ReactNode;
};

export const DisposicionExplorador = ({
  idSeleccionado,
  carpetaSeleccionada,
  onSeleccionarCarpeta,
  children,
}: DisposicionExploradorProps) => {
  const { t } = useI18n();
  const [abierto, setAbierto] = useState<boolean>(leerPanelAbierto);

  const establecerAbierto = (siguiente: boolean): void => {
    setAbierto(siguiente);
    guardarPanelAbierto(siguiente);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
      {abierto ? (
        <aside className="w-full lg:sticky lg:top-10 lg:w-64 lg:shrink-0">
          <ExploradorNotas
            idSeleccionado={idSeleccionado}
            carpetaSeleccionada={carpetaSeleccionada}
            onSeleccionarCarpeta={onSeleccionarCarpeta}
            onColapsar={() => establecerAbierto(false)}
          />
        </aside>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => establecerAbierto(true)}
          className="self-start"
        >
          <PanelLeftOpen aria-hidden="true" />
          {t("explorador.open")}
        </Button>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
