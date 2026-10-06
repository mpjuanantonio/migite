import { isReservedKey } from "../frontmatter/keys.js";
import { ObjectOperationError } from "./errors.js";
import type { ObjectRecord, ObjectRepository } from "./model.js";

export type AttributeTray = {
  addAttribute: (ref: string, key: string, value: unknown) => ObjectRecord;
  setAttribute: (ref: string, key: string, value: unknown) => ObjectRecord;
  removeAttribute: (ref: string, key: string) => ObjectRecord;
};

const invalidWrite = (problems: readonly string[]): ObjectOperationError =>
  new ObjectOperationError("error.invalidObjectWrite", { problems: problems.join("; ") }, [
    ...problems,
  ]);

const assertTrayKey = (key: string): void => {
  if (key.trim() === "") {
    throw invalidWrite(["attribute key must not be empty"]);
  }
  if (isReservedKey(key)) {
    throw new ObjectOperationError("error.reservedAttributeKey", { key });
  }
};

const readRecord = (repository: ObjectRepository, ref: string): ObjectRecord => {
  const result = repository.readObject(ref);
  if (!result.ok) {
    throw invalidWrite([`unreadable object file "${result.path}"`, ...result.problems]);
  }
  return result.object;
};

const writeAttribute = (
  repository: ObjectRepository,
  ref: string,
  key: string,
  value: unknown,
): ObjectRecord => {
  assertTrayKey(key);
  if (value === undefined) {
    throw invalidWrite([`attribute "${key}" requires a value; use removeAttribute to delete it`]);
  }
  const object = readRecord(repository, ref);
  return repository.updateObject(object.id, { attributes: { [key]: value } });
};

export const addAttribute = (
  repository: ObjectRepository,
  ref: string,
  key: string,
  value: unknown,
): ObjectRecord => writeAttribute(repository, ref, key, value);

export const setAttribute = (
  repository: ObjectRepository,
  ref: string,
  key: string,
  value: unknown,
): ObjectRecord => writeAttribute(repository, ref, key, value);

export const removeAttribute = (
  repository: ObjectRepository,
  ref: string,
  key: string,
): ObjectRecord => {
  assertTrayKey(key);
  const object = readRecord(repository, ref);
  if (!Object.hasOwn(object.attributes, key)) {
    return object;
  }
  const attribute = repository.getType(object.type)?.attributes.find((item) => item.id === key);
  if (attribute?.required === true) {
    throw invalidWrite([`required attribute "${key}" of type "${object.type}" cannot be removed`]);
  }
  return repository.updateObject(object.id, { attributes: { [key]: undefined } });
};

export const createAttributeTray = (repository: ObjectRepository): AttributeTray => ({
  addAttribute: (ref, key, value) => addAttribute(repository, ref, key, value),
  setAttribute: (ref, key, value) => setAttribute(repository, ref, key, value),
  removeAttribute: (ref, key) => removeAttribute(repository, ref, key),
});
