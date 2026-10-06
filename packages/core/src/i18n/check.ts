import type { Catalogs } from "./catalogs.js";
import { t } from "./t.js";

export const checkCatalogs = (catalogs: Catalogs): readonly string[] => {
  const entries = Object.entries(catalogs);
  const localeNames = entries.map(([locale]) => locale);
  const allKeys = [...new Set(entries.flatMap(([, catalog]) => Object.keys(catalog)))].sort();
  const problems: string[] = [];

  for (const key of allKeys) {
    const presentIn = entries
      .filter(([, catalog]) => Object.hasOwn(catalog, key))
      .map(([locale]) => locale);
    const absentIn = localeNames.filter((locale) => !presentIn.includes(locale));
    if (absentIn.length > 0) {
      problems.push(
        t("error.translationKeyMissing", {
          key,
          presentIn: presentIn.join(", "),
          absentIn: absentIn.join(", "),
        }),
      );
    }
  }

  return problems;
};
