export type ObjectFrontmatter = {
  id: string;
  type?: string;
  title: string;
  created: string;
  updated: string;
  links: string[];
  attributes: Record<string, unknown>;
};

export type ParsedObjectFile =
  | { ok: true; frontmatter: ObjectFrontmatter; body: string }
  | { ok: false; problems: string[]; raw: { yamlText: string; body: string } };
