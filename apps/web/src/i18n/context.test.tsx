import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, LOCALE_STORAGE_KEY, useI18n } from "./context";

const Probe = () => {
  const { locale, setLocale, t } = useI18n();

  return (
    <div>
      <p data-testid="locale">{locale}</p>
      <p data-testid="web">{t("nav.notas")}</p>
      <p data-testid="core">{t("error.notFound")}</p>
      <button type="button" onClick={() => setLocale("en")}>
        cambiar a inglés
      </button>
      <button type="button" onClick={() => setLocale("es")}>
        cambiar a español
      </button>
    </div>
  );
};

const renderProbe = () =>
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "es";
});

describe("I18nProvider", () => {
  it("arranca en español y actualiza el lang del documento", () => {
    renderProbe();

    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    expect(screen.getByTestId("web")).toHaveTextContent("Notas");
    expect(document.documentElement.lang).toBe("es");
  });

  it("cambia de idioma, persiste la elección y actualiza el documento", async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole("button", { name: "cambiar a inglés" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(screen.getByTestId("web")).toHaveTextContent("Notes");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");

    await user.click(screen.getByRole("button", { name: "cambiar a español" }));

    expect(screen.getByTestId("web")).toHaveTextContent("Notas");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });

  it("vuelve al idioma por defecto si lo guardado no es válido", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");

    renderProbe();

    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    expect(screen.getByTestId("web")).toHaveTextContent("Notas");
  });

  it("resuelve las claves del catálogo de @migite/core", () => {
    renderProbe();

    expect(screen.getByTestId("core")).toHaveTextContent("El recurso solicitado no existe");
  });
});
