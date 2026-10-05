export const createId = (prefix?: string): string => {
  const id = crypto.randomUUID();
  return prefix === undefined ? id : `${prefix}_${id}`;
};
