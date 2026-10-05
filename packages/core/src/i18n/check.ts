import type { Catalogs } from "./catalogs.js";

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
        `clave "${key}" presente en [${presentIn.join(", ")}] pero ausente en [${absentIn.join(", ")}]`,
      );
    }
  }

  return problems;
};
