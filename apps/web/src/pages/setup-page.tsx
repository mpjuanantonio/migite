import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useConfigurarCredenciales } from "@/api/hooks";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/context";
import { readLoginDestino } from "@/pages/login-page";

const MIN_CONTRASENA = 8;

export const SetupPage = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const configurar = useConfigurarCredenciales();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    if (contrasena.length < MIN_CONTRASENA) {
      setError(t("page.setup.errorCorta"));
      return;
    }
    if (contrasena !== confirmar) {
      setError(t("page.setup.errorCoinciden"));
      return;
    }
    configurar.mutate(
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
        <h1 className="mt-6 font-heading text-2xl font-medium">{t("page.setup.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("page.setup.description")}</p>
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
              autoComplete="new-password"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmar" className="text-sm font-medium">
              {t("page.setup.confirmarContrasena")}
            </label>
            <Input
              id="confirmar"
              name="confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(event) => setConfirmar(event.target.value)}
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
          <Button type="submit" className="w-full" disabled={configurar.isPending}>
            {configurar.isPending ? t("page.setup.creando") : t("page.setup.crear")}
          </Button>
        </form>
      </section>
    </main>
  );
};
