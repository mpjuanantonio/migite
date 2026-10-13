import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

describe("index.css", () => {
  it("activa color-scheme oscuro en la raíz cuando aplica el tema oscuro", () => {
    expect(css).toMatch(/:root\.dark\s*\{[^}]*color-scheme:\s*dark/);
  });

  it("da fondo y color legibles a las opciones de los desplegables nativos", () => {
    expect(css).toMatch(
      /option[^{]*\{[^}]*background-color:\s*var\(--popover\)[^}]*color:\s*var\(--popover-foreground\)/,
    );
  });
});
