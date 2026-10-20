export const DEFAULT_CHUNK_MAX_CHARS = 1500;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 150;

export type MarkdownChunk = {
  readonly heading: string | null;
  readonly text: string;
  readonly order: number;
};

export type ChunkMarkdownOptions = {
  readonly maxChars?: number;
  readonly overlapChars?: number;
};

type RawSection = {
  readonly heading: string | null;
  readonly text: string;
};

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]+(.*)|[ \t]*)$/;

const cleanHeading = (raw: string | undefined): string => {
  if (raw === undefined) {
    return "";
  }
  return raw.replace(/[ \t]+#+[ \t]*$/, "").trim();
};

const findBreakpoint = (text: string, end: number, minBreak: number): number => {
  const window = text.slice(minBreak, end);
  const paragraphIdx = window.lastIndexOf("\n\n");
  if (paragraphIdx !== -1) {
    return minBreak + paragraphIdx;
  }
  const lineIdx = window.lastIndexOf("\n");
  if (lineIdx !== -1) {
    return minBreak + lineIdx;
  }
  const spaceIdx = window.lastIndexOf(" ");
  if (spaceIdx !== -1) {
    return minBreak + spaceIdx;
  }
  return end;
};

const computeNextStart = (
  text: string,
  currentStart: number,
  breakPoint: number,
  overlapChars: number,
): number => {
  let trimAfterBreak = breakPoint;
  while (trimAfterBreak < text.length && /\s/.test(text[trimAfterBreak] ?? "")) {
    trimAfterBreak += 1;
  }
  if (overlapChars <= 0) {
    return Math.max(currentStart + 1, trimAfterBreak);
  }
  const rawOverlapStart = Math.max(currentStart + 1, breakPoint - overlapChars);
  if (rawOverlapStart >= breakPoint) {
    return Math.max(currentStart + 1, trimAfterBreak);
  }
  let snapped = rawOverlapStart;
  if (snapped > 0 && !/\s/.test(text[snapped - 1] ?? "") && !/\s/.test(text[snapped] ?? "")) {
    const overlapSlice = text.slice(snapped, breakPoint);
    const spaceMatch = overlapSlice.search(/\s+/);
    if (spaceMatch !== -1) {
      const candidate = snapped + spaceMatch;
      let afterSpace = candidate;
      while (afterSpace < breakPoint && /\s/.test(text[afterSpace] ?? "")) {
        afterSpace += 1;
      }
      if (afterSpace < breakPoint) {
        snapped = afterSpace;
      }
    }
  }
  while (snapped < breakPoint && /\s/.test(text[snapped] ?? "")) {
    snapped += 1;
  }
  return snapped < breakPoint ? snapped : Math.max(currentStart + 1, trimAfterBreak);
};

const splitSectionText = (text: string, maxChars: number, overlapChars: number): string[] => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  if (trimmed.length <= maxChars) {
    return [trimmed];
  }
  const pieces: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    while (start < trimmed.length && /\s/.test(trimmed[start] ?? "")) {
      start += 1;
    }
    if (start >= trimmed.length) {
      break;
    }
    if (trimmed.length - start <= maxChars) {
      const rest = trimmed.slice(start).trim();
      if (rest.length > 0) {
        pieces.push(rest);
      }
      break;
    }
    const end = start + maxChars;
    const minBreak = Math.min(end, start + Math.max(overlapChars + 1, Math.floor(maxChars * 0.5)));
    const breakPoint = findBreakpoint(trimmed, end, minBreak);
    const piece = trimmed.slice(start, breakPoint).trim();
    if (piece.length > 0) {
      pieces.push(piece);
    }
    start = computeNextStart(trimmed, start, breakPoint, overlapChars);
  }
  return pieces;
};

const parseSections = (body: string): RawSection[] => {
  const normalized = body.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const sections: RawSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];
  let activeFence: { readonly char: string; readonly length: number } | null = null;

  const flush = (): void => {
    const text = currentLines.join("\n").trim();
    if (text.length > 0) {
      sections.push({ heading: currentHeading, text });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (activeFence !== null) {
      currentLines.push(line);
      const fenceCloseRe = new RegExp(`^ {0,3}${activeFence.char}{${activeFence.length},}[ \\t]*$`);
      if (fenceCloseRe.test(line)) {
        activeFence = null;
      }
      continue;
    }

    const fenceMatch = FENCE_OPEN_RE.exec(line);
    if (fenceMatch !== null && fenceMatch[1] !== undefined) {
      const marker = fenceMatch[1];
      activeFence = { char: marker[0] ?? "`", length: marker.length };
      currentLines.push(line);
      continue;
    }

    const headingMatch = ATX_HEADING_RE.exec(line);
    if (headingMatch !== null) {
      flush();
      const headingText = cleanHeading(headingMatch[1]);
      currentHeading = headingText.length > 0 ? headingText : null;
      continue;
    }

    currentLines.push(line);
  }

  flush();
  return sections;
};

export const chunkMarkdownBySections = (
  body: string,
  title?: string,
  options?: ChunkMarkdownOptions,
): MarkdownChunk[] => {
  const maxChars = Math.max(1, options?.maxChars ?? DEFAULT_CHUNK_MAX_CHARS);
  const rawOverlap = Math.max(0, options?.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS);
  const overlapChars = Math.min(rawOverlap, Math.max(0, Math.floor(maxChars / 2)));

  const sections = parseSections(body);
  const chunks: MarkdownChunk[] = [];

  for (const section of sections) {
    const subTexts = splitSectionText(section.text, maxChars, overlapChars);
    for (const subText of subTexts) {
      chunks.push({
        heading: section.heading,
        text: subText,
        order: chunks.length,
      });
    }
  }

  if (chunks.length === 0) {
    const trimmedTitle = title?.trim() ?? "";
    if (trimmedTitle.length > 0) {
      return [{ heading: null, text: trimmedTitle, order: 0 }];
    }
  }

  return chunks;
};
