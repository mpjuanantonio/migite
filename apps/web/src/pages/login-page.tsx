import { BrandMark } from "@/components/brand-mark";
import { useI18n } from "@/i18n/context";

export const LoginPage = () => {
  const { t } = useI18n();

  return (
    <main id="contenido" className="flex min-h-screen items-center justify-center px-5 py-10">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sheet">
        <div className="flex items-center gap-3">
          <BrandMark className="size-7 text-primary" />
          <p className="font-heading text-lg font-semibold tracking-tight">{t("app.name")}</p>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-medium">{t("page.login.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("page.login.description")}</p>
      </section>
    </main>
  );
};
