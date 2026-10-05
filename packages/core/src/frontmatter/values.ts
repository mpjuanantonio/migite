const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

export const readOwn = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

export const writeOwn = (record: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

export const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export const asStringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: unknown[] = value;
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") {
      return undefined;
    }
    result.push(item);
  }
  return result;
};

export const isEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const leftItems: unknown[] = left;
    const rightItems: unknown[] = right;
    return (
      leftItems.length === rightItems.length &&
      leftItems.every((item, index) => isEqual(item, rightItems[index]))
    );
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.hasOwn(right, key) && isEqual(readOwn(left, key), readOwn(right, key)),
      )
    );
  }
  return false;
};
