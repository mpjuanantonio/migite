import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "@/api/api";
import { useTipos } from "@/api/hooks";
import { EditorTipo } from "@/components/tipos/editor-tipo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { esTipoSistema } from "@/lib/tipos";

export const TipoPage = () => {
  const { t } = useI18n();
  const { id } = useParams();
  const tipos = useTipos();

  if (tipos.isPending) {
    return (
      <section
        aria-busy="true"
        className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet"
      >
        <h1 className="font-heading text-display font-medium">{t("page.tipo.editTitle")}</h1>
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {t("page.tipo.loading")}
        </p>
      </section>
    );
  }

  const tipo = tipos.data?.find((item) => item.id === id);

  if (tipos.isError || tipo === undefined) {
    const mensaje = tipos.error instanceof ApiError ? tipos.error.mensaje : t("error.genericError");
    return (
      <section className="rounded-lg border border-border bg-card px-6 py-12 shadow-sheet">
        <h1 className="font-heading text-display font-medium">{t("page.tipo.notFound")}</h1>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          {tipos.isError ? mensaje : t("page.tipos.empty")}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void tipos.refetch()}>
            {t("page.tipo.retry")}
          </Button>
          <Button asChild variant="ghost">
            <Link to="/tipos">
              <ArrowLeft aria-hidden="true" />
              {t("page.tipo.back")}
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return <EditorTipo key={tipo.id} tipo={tipo} soloLectura={esTipoSistema(tipo.id)} />;
};
