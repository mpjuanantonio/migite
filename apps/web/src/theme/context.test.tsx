import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { I18nProvider } from "@/i18n/context";
import { COLOR_TEMA_CLARO, COLOR_TEMA_OSCURO, TEMA_STORAGE_KEY, TemaProvider } from "./context";

type OyenteTema = (evento: MediaQueryListEvent) => void;

const simularSistema = (oscuro: boolean) => {
  const oyentes = new Set<OyenteTema>();
  const media = {
    matches: oscuro,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_tipo: string, oyente: OyenteTema): void => {
      oyentes.add(oyente);
    },
    removeEventListener: (_tipo: string, oyente: OyenteTema): void => {
      oyentes.delete(oyente);
    },
    addListener: (oyente: OyenteTema): void => {
      oyentes.add(oyente);
    },
    removeListener: (oyente: OyenteTema): void => {
      oyentes.delete(oyente);
    },
    dispatchEvent: (): boolean => false,
  };

  window.matchMedia = () => media as unknown as MediaQueryList;

  return {
    cambiar: (siguiente: boolean): void => {
      media.matches = siguiente;
      act(() => {
        for (const oyente of oyentes) {
          oyente({ matches: siguiente } as MediaQueryListEvent);
        }
      });
    },
  };
};

const crearMeta = (media: string, content: string): HTMLMetaElement => {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("media", media);
  meta.setAttribute("content", content);
  document.head.append(meta);
  return meta;
};

const renderSelector = () =>
  render(
    <I18nProvider>
      <TemaProvider>
        <ThemeSwitcher />
      </TemaProvider>
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.remove();
  }
});

describe("TemaProvider", () => {
  it("por defecto usa system y sigue la preferencia del sistema", () => {
    simularSistema(true);

    renderSelector();

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Tema: Sistema" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("cicla claro → oscuro → sistema, cambia la clase dark y persiste", async () => {
    const user = userEvent.setup();
    simularSistema(false);

    renderSelector();

    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Tema: Sistema" }));

    expect(screen.getByRole("button", { name: "Tema: Claro" })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBe("light");

    await user.click(screen.getByRole("button", { name: "Tema: Claro" }));

    expect(screen.getByRole("button", { name: "Tema: Oscuro" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Tema: Oscuro" }));

    expect(screen.getByRole("button", { name: "Tema: Sistema" })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem(TEMA_STORAGE_KEY)).toBe("system");
  });

  it("al recargar respeta el tema guardado", () => {
    localStorage.setItem(TEMA_STORAGE_KEY, "dark");
    simularSistema(false);

    renderSelector();

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Tema: Oscuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("ignora un tema guardado no válido y vuelve a system", () => {
    localStorage.setItem(TEMA_STORAGE_KEY, "fr");
    simularSistema(true);

    renderSelector();

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Tema: Sistema" })).toBeInTheDocument();
  });

  it("en modo system reacciona a los cambios del sistema", () => {
    const sistema = simularSistema(false);

    renderSelector();

    expect(document.documentElement).not.toHaveClass("dark");

    sistema.cambiar(true);

    expect(document.documentElement).toHaveClass("dark");

    sistema.cambiar(false);

    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("actualiza meta theme-color según el modo efectivo", async () => {
    const user = userEvent.setup();
    const claro = crearMeta("(prefers-color-scheme: light)", COLOR_TEMA_CLARO);
    const oscuro = crearMeta("(prefers-color-scheme: dark)", COLOR_TEMA_OSCURO);
    simularSistema(true);

    renderSelector();

    expect(claro).toHaveAttribute("content", COLOR_TEMA_OSCURO);
    expect(oscuro).toHaveAttribute("content", COLOR_TEMA_OSCURO);
    expect(claro).toHaveAttribute("media", "all");

    await user.click(screen.getByRole("button", { name: "Tema: Sistema" }));

    expect(claro).toHaveAttribute("content", COLOR_TEMA_CLARO);
    expect(oscuro).toHaveAttribute("content", COLOR_TEMA_CLARO);
  });
});
