import { locales } from "@migite/core";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

const labels = {
  es: "shell.languageEs",
  en: "shell.languageEn",
} as const;

export const LanguageSwitcher = () => {
  const { locale, setLocale, t } = useI18n();

  return (
    <fieldset className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      <legend className="sr-only">{t("shell.language")}</legend>
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-label={t(labels[option])}
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
          className={cn(
            "rounded-[4px] px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            locale === option
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </fieldset>
  );
};
