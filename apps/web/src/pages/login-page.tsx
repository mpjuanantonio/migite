import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useIniciarSesion } from "@/api/hooks";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";

const DESTINO_POR_DEFECTO = "/notas";

export const readLoginDestino = (state: unknown): string => {
  const from =
    typeof state === "object" && state !== null
      ? (state as { readonly from?: unknown }).from
      : undefined;
  return typeof from === "string" && from.startsWith("/") ? from : DESTINO_POR_DEFECTO;
};

export const LoginPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const iniciarSesion = useIniciarSesion();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    iniciarSesion.mutate(
      { usuario, contrasena },
      {
        onSuccess: () => navigate(readLoginDestino(location.state), { replace: true }),
        onError: (caught) => {
          setError(caught instanceof ApiError ? caught.mensaje : t("error.genericError"));
        },
      },
    );
  };

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sheet">
        <div className="flex items-center gap-3">
          <BrandMark className="size-7 text-primary" />
          <p className="font-heading text-lg font-semibold tracking-tight">{t("app.name")}</p>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-medium">{t("page.login.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("page.login.description")}</p>
        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario" className="text-sm font-medium">
              {t("page.login.usuario")}
            </label>
            <Input
              id="usuario"
              name="usuario"
              autoComplete="username"
              value={usuario}
              onChange={(event) => setUsuario(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contrasena" className="text-sm font-medium">
              {t("page.login.contrasena")}
            </label>
            <Input
              id="contrasena"
              name="contrasena"
              type="password"
              autoComplete="current-password"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              required
            />
          </div>
          {error !== undefined ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={iniciarSesion.isPending}>
            {iniciarSesion.isPending ? t("page.login.entrando") : t("page.login.entrar")}
          </Button>
        </form>
      </section>
    </main>
  );
};
