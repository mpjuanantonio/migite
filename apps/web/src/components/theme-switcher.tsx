import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { type Tema, useTema } from "@/theme/context";

const CICLO: readonly Tema[] = ["light", "dark", "system"];

const ETIQUETAS = {
  light: "shell.temaClaro",
  dark: "shell.temaOscuro",
  system: "shell.temaSistema",
} as const satisfies Record<Tema, AppTranslationKey>;

const ICONOS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const satisfies Record<Tema, LucideIcon>;

export const ThemeSwitcher = () => {
  const { t } = useI18n();
  const { tema, modoEfectivo, setTema } = useTema();
  const Icono = ICONOS[tema];
  const etiqueta = `${t("shell.tema")}: ${t(ETIQUETAS[tema])}`;
  const siguiente = CICLO[(CICLO.indexOf(tema) + 1) % CICLO.length] ?? "system";

  return (
    <button
      type="button"
      aria-label={etiqueta}
      aria-pressed={modoEfectivo === "dark"}
      title={etiqueta}
      onClick={() => setTema(siguiente)}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-[min(var(--radius-md),10px)]",
        "text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
      )}
    >
      <Icono aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
    </button>
  );
};
