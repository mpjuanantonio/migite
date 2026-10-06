import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ObjectFrontmatter, parseObjectFile } from "../frontmatter/index.js";
import { t } from "../i18n/index.js";
import {
  bootstrapVault,
  createObjectRepository,
  ObjectOperationError,
  type ObjectRepository,
} from "./index.js";

const fsGates = vi.hoisted(() => ({
  mutate: undefined as { suffix: string; onRead: number; text: string } | undefined,
  reads: new Map<string, number>(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (
      path: Parameters<typeof actual.readFileSync>[0],
      options?: Parameters<typeof actual.readFileSync>[1],
    ) => {
      const key = String(path);
      const count = (fsGates.reads.get(key) ?? 0) + 1;
      fsGates.reads.set(key, count);
      const gate = fsGates.mutate;
      if (gate !== undefined && key.endsWith(gate.suffix) && count === gate.onRead) {
        fsGates.mutate = undefined;
        return gate.text;
      }
      return actual.readFileSync(path, options);
    },
  };
});

const roots: string[] = [];

const setupVault = (): { vaultDir: string; repo: ObjectRepository } => {
  const vaultDir = mkdtempSync(join(tmpdir(), "migite-rename-"));
  roots.push(vaultDir);
  bootstrapVault(vaultDir);
  return { vaultDir, repo: createObjectRepository({ vaultDir, timeZone: "Europe/Madrid" }) };
};

const captureError = (action: () => unknown): ObjectOperationError => {
  try {
    action();
  } catch (error) {
    if (error instanceof ObjectOperationError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an ObjectOperationError");
};

const parseVaultFile = (
  vaultDir: string,
  path: string,
): { frontmatter: ObjectFrontmatter; body: string } => {
  const parsed = parseObjectFile(readFileSync(join(vaultDir, path), "utf8"));
  if (!parsed.ok) {
    throw new Error(`expected a parsed file at ${path}, got: ${parsed.problems.join("; ")}`);
  }
  return { frontmatter: parsed.frontmatter, body: parsed.body };
};

afterEach(() => {
  fsGates.mutate = undefined;
  fsGates.reads.clear();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("renameObject", () => {
  it("renames the file, updates titulo/actualizado and rewrites links in body and enlaces", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({ title: "Destino", body: "contenido\n" });
    repo.createObject({
      title: "Fuente",
      body: "ver [[Destino]] y [[Destino|alias]]\n",
      links: ["[[Destino#ancla|alias]]", "[[Otro]]"],
    });
    const created = parseVaultFile(vaultDir, "destino.md");

    const report = repo.renameObject(target.id, "Objetivo");

    expect(report.object.title).toBe("Objetivo");
    expect(report.object.path).toBe("objetivo.md");
    expect(report.object.fileName).toBe("objetivo.md");
    expect(report.rewritten).toEqual(["fuente.md"]);
    expect(report.skipped).toEqual([]);
    expect(report.unresolvedLinks).toEqual([]);
    expect(existsSync(join(vaultDir, "destino.md"))).toBe(false);

    const renamed = parseVaultFile(vaultDir, "objetivo.md");
    expect(renamed.frontmatter.id).toBe(target.id);
    expect(renamed.frontmatter.title).toBe("Objetivo");
    expect(renamed.frontmatter.created).toBe(created.frontmatter.created);
    expect(renamed.frontmatter.type).toBe("nota");
    expect(renamed.body).toBe("contenido\n");

    const source = parseVaultFile(vaultDir, "fuente.md");
    expect(source.body).toBe("ver [[Objetivo]] y [[Objetivo|alias]]\n");
    expect(source.frontmatter.links).toEqual(["[[Objetivo#ancla|alias]]", "[[Otro]]"]);

    const byTitle = repo.readObject("Fuente");
    expect(byTitle.ok && byTitle.object.body).toBe("ver [[Objetivo]] y [[Objetivo|alias]]\n");
  });

  it("resolves and rewrites titles case-insensitively and trims them", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({ title: "Destino" });
    repo.createObject({
      title: "Fuente",
      body: "[[  destino ]] y [[DESTINO#ancla]]\n",
    });

    repo.renameObject(target.id, "Objetivo");

    expect(parseVaultFile(vaultDir, "fuente.md").body).toBe("[[Objetivo]] y [[Objetivo#ancla]]\n");
  });

  it("rewrites the renamed object's own self-links and keeps alias and heading", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({
      title: "Destino",
      body: "self [[Destino#ancla|alias]]\n",
      links: ["[[Destino]]"],
    });

    const report = repo.renameObject(target.id, "Objetivo");

    expect(report.object.body).toBe("self [[Objetivo#ancla|alias]]\n");
    expect(report.object.links).toEqual(["[[Objetivo]]"]);
    const renamed = parseVaultFile(vaultDir, "objetivo.md");
    expect(renamed.body).toBe("self [[Objetivo#ancla|alias]]\n");
    expect(renamed.frontmatter.links).toEqual(["[[Objetivo]]"]);
  });

  it("accepts a casing-only rename and updates the incoming links", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({ title: "Zeta" });
    repo.createObject({ title: "Fuente", body: "[[Zeta]]\n" });

    const report = repo.renameObject(target.id, "ZETA");

    expect(report.object.path).toBe("zeta.md");
    expect(report.object.title).toBe("ZETA");
    expect(parseVaultFile(vaultDir, "zeta.md").frontmatter.title).toBe("ZETA");
    expect(parseVaultFile(vaultDir, "fuente.md").body).toBe("[[ZETA]]\n");
  });

  it("rejects a new title that already exists in another object", () => {
    const { vaultDir, repo } = setupVault();
    const first = repo.createObject({ title: "Uno", body: "[[Dos]]\n" });
    repo.createObject({ title: "Dos" });

    const error = captureError(() => repo.renameObject(first.id, "  dos  "));

    expect(error.key).toBe("error.ambiguousTitle");
    expect(error.message).toBe(t("error.ambiguousTitle", { title: "dos" }));
    expect(existsSync(join(vaultDir, "uno.md"))).toBe(true);
    expect(parseVaultFile(vaultDir, "uno.md").frontmatter.title).toBe("Uno");
    expect(parseVaultFile(vaultDir, "uno.md").body).toBe("[[Dos]]\n");
  });

  it("rejects an empty new title without touching the file", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({ title: "Uno" });

    const error = captureError(() => repo.renameObject(target.id, "   "));

    expect(error.key).toBe("error.invalidObjectWrite");
    expect(error.problems.join(" ")).toContain("title must not be empty");
    expect(existsSync(join(vaultDir, "uno.md"))).toBe(true);
  });

  it("returns a no-op report when the title does not change", () => {
    const { repo } = setupVault();
    const target = repo.createObject({ title: "Uno" });

    const report = repo.renameObject(target.id, "Uno");

    expect(report.object.path).toBe("uno.md");
    expect(report.rewritten).toEqual([]);
    expect(report.skipped).toEqual([]);
    expect(report.unresolvedLinks).toEqual([]);
  });

  it("renames an object inside a folder keeping it there", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({ title: "Nota", folder: "diario" });
    repo.createObject({ title: "Otra", folder: "diario", body: "[[Nota]]\n" });

    const report = repo.renameObject(target.id, "Nota del día");

    expect(report.object.path).toBe("diario/nota-del-dia.md");
    expect(report.object.folder).toBe("diario");
    expect(report.rewritten).toEqual(["diario/otra.md"]);
    expect(parseVaultFile(vaultDir, "diario/otra.md").body).toBe("[[Nota del día]]\n");
  });

  it("applies the createObject collision policy when the slug file name is taken", () => {
    const { vaultDir, repo } = setupVault();
    const other = repo.createObject({ title: "Otra" });
    renameSync(join(vaultDir, other.path), join(vaultDir, "objetivo.md"));
    const target = repo.createObject({ title: "Destino" });

    const report = repo.renameObject(target.id, "Objetivo");

    expect(report.object.path).toBe(`objetivo-${target.id.slice(0, 4).toLowerCase()}.md`);
    expect(existsSync(join(vaultDir, report.object.path))).toBe(true);
    expect(existsSync(join(vaultDir, "destino.md"))).toBe(false);
    expect(readFileSync(join(vaultDir, "objetivo.md"), "utf8")).toContain("Otra");
  });

  it("skips an incoming file modified on disk after the scan and reports the broken links", () => {
    const { vaultDir, repo } = setupVault();
    const target = repo.createObject({ title: "Destino" });
    repo.createObject({ title: "Fuente", body: "[[Destino]]\n" });
    const before = readFileSync(join(vaultDir, "fuente.md"), "utf8");
    fsGates.reads.clear();
    fsGates.mutate = {
      suffix: "fuente.md",
      onRead: 3,
      text: before.replace("[[Destino]]", "[[Destino]] editado fuera de la app"),
    };

    const report = repo.renameObject(target.id, "Objetivo");

    expect(report.rewritten).toEqual([]);
    expect(report.skipped).toEqual([
      { path: "fuente.md", problems: ["file changed on disk since it was scanned"] },
    ]);
    expect(report.unresolvedLinks).toEqual([{ path: "fuente.md", link: "[[Destino]]" }]);
    expect(report.object.path).toBe("objetivo.md");
    expect(readFileSync(join(vaultDir, "fuente.md"), "utf8")).toBe(before);
    expect(before).toContain("[[Destino]]");
  });
});

describe("moveObject", () => {
  it("moves the file into a new nested folder keeping its links untouched", () => {
    const { vaultDir, repo } = setupVault();
    const record = repo.createObject({
      title: "Mover",
      body: "ver [[Destino]]\n",
      links: ["[[Destino]]"],
    });

    const moved = repo.moveObject(record.id, "notas/sub");

    expect(moved.path).toBe("notas/sub/mover.md");
    expect(moved.folder).toBe("notas/sub");
    expect(moved.fileName).toBe("mover.md");
    expect(existsSync(join(vaultDir, "notas/sub/mover.md"))).toBe(true);
    expect(existsSync(join(vaultDir, "mover.md"))).toBe(false);
    const file = parseVaultFile(vaultDir, moved.path);
    expect(file.body).toBe("ver [[Destino]]\n");
    expect(file.frontmatter.links).toEqual(["[[Destino]]"]);
    expect(repo.readObject(record.id).ok).toBe(true);
  });

  it("moves the file back to the vault root", () => {
    const { vaultDir, repo } = setupVault();
    const record = repo.createObject({ title: "Mover", folder: "notas" });

    const moved = repo.moveObject(record.id, "  ");

    expect(moved.path).toBe("mover.md");
    expect(moved.folder).toBe("");
    expect(existsSync(join(vaultDir, "mover.md"))).toBe(true);
  });

  it("suffixes the file name when the target folder already has that name", () => {
    const { vaultDir, repo } = setupVault();
    repo.createObject({ title: "Mover", folder: "notas" });
    const root = repo.createObject({ title: "Mover" });

    const moved = repo.moveObject(root.id, "notas");

    expect(moved.path).toBe(`notas/mover-${root.id.slice(0, 4).toLowerCase()}.md`);
    expect(existsSync(join(vaultDir, "notas/mover.md"))).toBe(true);
  });

  it("rejects a reserved or absolute folder without moving the file", () => {
    const { vaultDir, repo } = setupVault();
    const record = repo.createObject({ title: "Mover" });

    const reserved = captureError(() => repo.moveObject(record.id, "tipos"));
    expect(reserved.key).toBe("error.invalidObjectWrite");
    const absolute = captureError(() => repo.moveObject(record.id, "/tmp/fuera"));
    expect(absolute.key).toBe("error.invalidObjectWrite");
    expect(existsSync(join(vaultDir, "mover.md"))).toBe(true);
  });
});

describe("findIncomingLinks", () => {
  it("reports body and frontmatter links matched case-insensitively, including self-links", () => {
    const { repo } = setupVault();
    const target = repo.createObject({ title: "Destino", body: "self [[destino]]\n" });
    const source = repo.createObject({
      title: "Fuente",
      body: "[[Destino|alias]]\n",
      links: ["[[Destino#ancla]]", "[[Otro]]"],
    });
    repo.createObject({ title: "Ajena", body: "[[Otra cosa]]\n" });

    const incoming = repo
      .findIncomingLinks(target.id)
      .sort((left, right) =>
        `${left.path}:${left.context}:${left.raw}`.localeCompare(
          `${right.path}:${right.context}:${right.raw}`,
        ),
      );

    expect(incoming).toEqual([
      {
        objectId: target.id,
        path: "destino.md",
        context: "body",
        raw: "[[destino]]",
      },
      {
        objectId: source.id,
        path: "fuente.md",
        context: "body",
        raw: "[[Destino|alias]]",
      },
      {
        objectId: source.id,
        path: "fuente.md",
        context: "frontmatter",
        raw: "[[Destino#ancla]]",
      },
    ]);
  });

  it("returns an empty list when nobody links to the object", () => {
    const { repo } = setupVault();
    const target = repo.createObject({ title: "Solo" });

    expect(repo.findIncomingLinks(target.id)).toEqual([]);
  });
});
