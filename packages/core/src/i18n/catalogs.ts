import { en } from "./en.js";
import { es } from "./es.js";

export type Catalog = Readonly<Record<string, string>>;

export type Catalogs = Readonly<Record<string, Catalog>>;

export const catalogs: Catalogs = { es, en };
