export type WikiLink = {
  title: string;
  alias?: string;
  heading?: string;
  raw: string;
  index: number;
};

const WIKILINK_PATTERN = String.raw`\[\[([^\[\]]+)\]\]`;

export const normalizeTitle = (title: string): string => title.trim().toLowerCase();

const buildLink = (inner: string, raw: string, index: number): WikiLink => {
  const pipe = inner.indexOf("|");
  const target = pipe === -1 ? inner : inner.slice(0, pipe);
  const alias = pipe === -1 ? undefined : inner.slice(pipe + 1).trim();
  const hash = target.indexOf("#");
  const heading = hash === -1 ? undefined : target.slice(hash + 1).trim();
  const title = (hash === -1 ? target : target.slice(0, hash)).trim();
  const link: WikiLink = { title, raw, index };
  if (heading !== undefined) {
    link.heading = heading;
  }
  if (alias !== undefined) {
    link.alias = alias;
  }
  return link;
};

export const parseWikiLinks = (text: string): WikiLink[] => {
  const links: WikiLink[] = [];
  for (const match of text.matchAll(new RegExp(WIKILINK_PATTERN, "g"))) {
    links.push(buildLink(match[1] ?? "", match[0], match.index ?? 0));
  }
  return links;
};

export const rewriteWikiLinks = (text: string, oldTitle: string, newTitle: string): string => {
  const previous = normalizeTitle(oldTitle);
  const next = newTitle.trim();
  if (previous === "" || next === "") {
    return text;
  }
  return text.replace(new RegExp(WIKILINK_PATTERN, "g"), (raw: string, inner: string) => {
    const link = buildLink(inner, raw, 0);
    if (normalizeTitle(link.title) !== previous) {
      return raw;
    }
    let rebuilt = `[[${next}`;
    if (link.heading !== undefined) {
      rebuilt += `#${link.heading}`;
    }
    if (link.alias !== undefined) {
      rebuilt += `|${link.alias}`;
    }
    return `${rebuilt}]]`;
  });
};
