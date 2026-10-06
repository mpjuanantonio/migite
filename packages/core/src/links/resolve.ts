import { normalizeTitle, parseWikiLinks, type WikiLink } from "./wikilink.js";

export type WikiLinkTarget = {
  id: string;
  path: string;
};

export type TitleResolver = (title: string) => WikiLinkTarget | undefined;

export type UnresolvedWikiLink = {
  raw: string;
  title: string;
};

export const resolveWikiLink = (
  link: WikiLink,
  resolve: TitleResolver,
): WikiLinkTarget | undefined => {
  if (normalizeTitle(link.title) === "") {
    return undefined;
  }
  return resolve(link.title);
};

export const findUnresolvedWikiLinks = (
  text: string,
  resolve: TitleResolver,
): UnresolvedWikiLink[] => {
  const unresolved: UnresolvedWikiLink[] = [];
  for (const link of parseWikiLinks(text)) {
    if (normalizeTitle(link.title) !== "" && resolve(link.title) === undefined) {
      unresolved.push({ raw: link.raw, title: link.title });
    }
  }
  return unresolved;
};
