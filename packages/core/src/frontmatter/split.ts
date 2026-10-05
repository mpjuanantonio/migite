export type SplitKind = "missing" | "unterminated" | "ok";

export type SplitObjectFile = {
  kind: SplitKind;
  yamlText: string;
  body: string;
};

const OPENING = /^---(?:\r\n|\n)/;
const CLOSING = /(?:^|\r?\n)---(?:\r\n|\n|$)/;

export const splitObjectFile = (text: string): SplitObjectFile => {
  const opening = OPENING.exec(text);
  if (opening === null) {
    return { kind: "missing", yamlText: "", body: text };
  }
  const rest = text.slice(opening[0].length);
  const closing = CLOSING.exec(rest);
  if (closing === null) {
    return { kind: "unterminated", yamlText: "", body: text };
  }
  const delimiter = closing[0].startsWith("---")
    ? closing.index
    : closing.index + (closing[0].startsWith("\r\n") ? 2 : 1);
  return {
    kind: "ok",
    yamlText: rest.slice(0, delimiter),
    body: rest.slice(closing.index + closing[0].length),
  };
};

export const joinObjectFile = (yamlText: string, body: string, eol: string): string => {
  const yaml = yamlText === "" || yamlText.endsWith(eol) ? yamlText : `${yamlText}${eol}`;
  return `---${eol}${yaml}---${eol}${body}`;
};
