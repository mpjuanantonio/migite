import { FileText } from "lucide-react";
import { useParams } from "react-router-dom";
import { useI18n } from "@/i18n/context";

export const ObjetoPage = () => {
  const { t } = useI18n();
  const { id } = useParams();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-5">
        <h1 className="font-heading text-display font-medium text-foreground">
          {t("page.objeto.title")}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {t("page.objeto.description")}
        </p>
        {id === undefined ? null : (
          <p translate="no" className="mt-3 text-sm font-medium text-foreground tabular-nums">
            {id}
          </p>
        )}
      </header>
      <section className="rounded-lg border border-border bg-card px-6 py-10 shadow-sheet">
        <FileText aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">{t("page.objeto.empty")}</p>
      </section>
    </div>
  );
};
