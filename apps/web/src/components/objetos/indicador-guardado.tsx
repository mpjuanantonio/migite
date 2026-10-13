import { cn } from "cn";
import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/context";

export type EstadoGuardado = "inactivo" | "guardando" | "guardado" | "error";

type IndicadorGuardadoProps = {
  readonly estado: EstadoGuardado;
  readonly mensaje?: string;
  readonly onReintentar: () => void;
};

const DESVANECIDO_MS = 2500;

const CLASE_BASE = "flex size-6 items-center justify-center rounded-md text-muted-foreground";

export const IndicadorGuardado = ({ estado, mensaje, onReintentar }: IndicadorGuardadoProps) => {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (estado !== "guardado") {
      return;
    }
    const temporizador = setTimeout(() => setVisible(false), DESVANECIDO_MS);
    return () => clearTimeout(temporizador);
  }, [estado]);

  if (estado === "inactivo") {
    return null;
  }

  if (estado === "error") {
    const detalle = mensaje ?? t("error.genericError");
    return (
      <button
        type="button"
        title={`${t("page.objeto.saveError")}: ${detalle}`}
        aria-label={`${t("page.objeto.saveError")}: ${detalle}. ${t("page.objeto.retry")}`}
        className={cn(CLASE_BASE, "pointer-events-auto text-destructive hover:bg-destructive/10")}
        onClick={onReintentar}
      >
        <TriangleAlert aria-hidden="true" className="size-3.5" />
      </button>
    );
  }

  const guardando = estado === "guardando";
  return (
    <span
      role="status"
      aria-label={guardando ? t("page.objeto.saving") : t("page.objeto.saved")}
      className={cn(
        CLASE_BASE,
        "pointer-events-none transition-opacity duration-700 motion-reduce:transition-none",
        !guardando && !visible ? "opacity-0" : "opacity-100",
      )}
    >
      {guardando ? (
        <LoaderCircle
          aria-hidden="true"
          className="size-3.5 animate-spin motion-reduce:animate-none"
        />
      ) : (
        <CircleCheck aria-hidden="true" className="size-3.5 text-primary/70" />
      )}
    </span>
  );
};
