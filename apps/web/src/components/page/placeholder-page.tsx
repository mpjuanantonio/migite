import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/context";
import type { AppTranslationKey } from "@/i18n/translate";

type PlaceholderPageProps = {
  readonly titleKey: AppTranslationKey;
  readonly descriptionKey: AppTranslationKey;
  readonly emptyKey: AppTranslationKey;
  readonly icon: LucideIcon;
};

export const PlaceholderPage = ({
  titleKey,
  descriptionKey,
  emptyKey,
  icon: Icon,
}: PlaceholderPageProps) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-5">
        <h1 className="font-heading text-display font-medium text-foreground">{t(titleKey)}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{t(descriptionKey)}</p>
      </header>
      <section className="rounded-lg border border-border bg-card px-6 py-10 shadow-sheet">
        <Icon aria-hidden="true" className="size-6 text-primary" strokeWidth={1.5} />
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">{t(emptyKey)}</p>
      </section>
    </div>
  );
};
