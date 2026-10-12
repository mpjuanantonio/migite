import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Tema = "light" | "dark" | "system";
export type ModoEfectivo = "light" | "dark";

export const TEMA_STORAGE_KEY = "migite.tema";
export const COLOR_TEMA_CLARO = "#f3f4ef";
export const COLOR_TEMA_OSCURO = "#161a18";

const TEMAS: readonly Tema[] = ["light", "dark", "system"];
const CONSULTA_OSCURO = "(prefers-color-scheme: dark)";

const esTema = (valor: string | null): valor is Tema =>
  valor !== null && (TEMAS as readonly string[]).includes(valor);

const leerTemaGuardado = (): Tema => {
  try {
    const guardado = localStorage.getItem(TEMA_STORAGE_KEY);
    return esTema(guardado) ? guardado : "system";
  } catch {
    return "system";
  }
};

const guardarTema = (tema: Tema): void => {
  try {
    localStorage.setItem(TEMA_STORAGE_KEY, tema);
  } catch {
    return;
  }
};

const prefiereOscuro = (): boolean =>
  typeof window.matchMedia === "function" && window.matchMedia(CONSULTA_OSCURO).matches;

const aplicarThemeColor = (modo: ModoEfectivo): void => {
  const color = modo === "dark" ? COLOR_TEMA_OSCURO : COLOR_TEMA_CLARO;
  const metas = document.querySelectorAll('meta[name="theme-color"]');

  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.append(meta);
    return;
  }

  for (const meta of metas) {
    meta.setAttribute("media", "all");
    meta.setAttribute("content", color);
  }
};

const aplicarModo = (modo: ModoEfectivo): void => {
  document.documentElement.classList.toggle("dark", modo === "dark");
  aplicarThemeColor(modo);
};

type TemaContextValue = {
  readonly tema: Tema;
  readonly modoEfectivo: ModoEfectivo;
  readonly setTema: (tema: Tema) => void;
};

const TemaContext = createContext<TemaContextValue | undefined>(undefined);

type TemaProviderProps = {
  readonly children: ReactNode;
};

export const TemaProvider = ({ children }: TemaProviderProps) => {
  const [tema, setTemaState] = useState<Tema>(leerTemaGuardado);
  const [sistemaOscuro, setSistemaOscuro] = useState<boolean>(prefiereOscuro);

  const modoEfectivo: ModoEfectivo = tema === "system" ? (sistemaOscuro ? "dark" : "light") : tema;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(CONSULTA_OSCURO);
    setSistemaOscuro(media.matches);

    const alCambiar = (evento: MediaQueryListEvent): void => setSistemaOscuro(evento.matches);
    media.addEventListener("change", alCambiar);

    return () => media.removeEventListener("change", alCambiar);
  }, []);

  useEffect(() => {
    aplicarModo(modoEfectivo);
  }, [modoEfectivo]);

  const setTema = useCallback((siguiente: Tema) => {
    setTemaState(siguiente);
    guardarTema(siguiente);
  }, []);

  const value = useMemo<TemaContextValue>(
    () => ({ tema, modoEfectivo, setTema }),
    [tema, modoEfectivo, setTema],
  );

  return <TemaContext.Provider value={value}>{children}</TemaContext.Provider>;
};

export const useTema = (): TemaContextValue => {
  const contexto = useContext(TemaContext);
  if (contexto === undefined) {
    throw new Error("useTema requiere un TemaProvider");
  }
  return contexto;
};
