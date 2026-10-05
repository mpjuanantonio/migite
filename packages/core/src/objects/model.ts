import type { SeedNativeTypesResult } from "../native-types/seed.js";
import type { TypeDefinition, TypeWarning } from "../types/index.js";

export type ObjectSummary = {
  id: string;
  type: string;
  title: string;
  path: string;
  folder: string;
  updated: string;
};

export type ObjectRecord = {
  id: string;
  type: string;
  title: string;
  path: string;
  folder: string;
  fileName: string;
  created: string;
  updated: string;
  links: string[];
  attributes: Record<string, unknown>;
  body: string;
};

export type CreateObjectInput = {
  title: string;
  type?: string;
  body?: string;
  attributes?: Record<string, unknown>;
  links?: string[];
  folder?: string;
};

export type UpdateObjectChanges = {
  title?: string;
  body?: string;
  attributes?: Record<string, unknown>;
  links?: string[];
  type?: never;
};

export type ReadObjectResult =
  | { ok: true; object: ObjectRecord }
  | {
      ok: false;
      path: string;
      problems: readonly string[];
      raw: { yamlText: string; body: string };
    };

export type ObjectRepository = {
  listObjects: () => ObjectSummary[];
  readObject: (ref: string) => ReadObjectResult;
  createObject: (input: CreateObjectInput) => ObjectRecord;
  updateObject: (id: string, changes: UpdateObjectChanges) => ObjectRecord;
  deleteObject: (id: string) => void;
  listTypes: () => TypeDefinition[];
  listTypeWarnings: () => TypeWarning[];
  getType: (typeId: string) => TypeDefinition | undefined;
  findObjectByTitle: (title: string) => ObjectSummary | undefined;
};

export type VaultBootstrap = {
  seed: SeedNativeTypesResult;
  types: TypeDefinition[];
  warnings: TypeWarning[];
};
