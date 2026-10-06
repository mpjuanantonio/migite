import {
  bootstrapVault,
  createObjectRepository,
  type ObjectRecord,
} from "../packages/core/src/index.js";

const VAULT_DIR = "./vault";
const TIME_ZONE = "Europe/Madrid";
const BOARD_TITLE = "Tablero de tareas";

const BOARD_ROWS = [
  "| Nombre | Estado | Prioridad | Fecha | Por qué |",
  "|---|---|---|---|---|",
  "| Workflows CI/release a pnpm + changesets@v2 | pendiente | alta | — | `ci.yml`/`release.yml` usan npm y `changesets/action@v1` no existe: la CI queda rota y nada entra a main con checks verdes (RNF-051) |",
  "| deploy.yml: `/api/health` + environment `production` | pendiente | alta | — | El smoke test apunta a `/health` y marcaría rollback falso; el gate humano del environment no existe |",
  "| Protecciones de main: check `ci` + CODEOWNERS monorepo | pendiente | alta | — | Hoy puede mergearse con la CI en rota y CODEOWNERS no cubre `apps/`/`packages/` |",
  "| Verificar Docker real en WSL2 | pendiente | alta | — | Los agentes sin daemon Docker no pudieron verificar `docker compose up` + health + persistencia (✔ de T0.5) |",
  "| Push + PR + merge de M0 y M1 | pendiente | alta | — | `feat/m0-preparacion` y `feat/m1-nucleo-datos` solo viven local; el merge lo haces tú (flujo HITL) |",
  "| Decidir AGENTS.md (commit del bloque turbo o `agentGuidance: false`) | pendiente | media | — | Turbo inyectó su bloque gestionado en AGENTS.md y solo tú puedes tocar ese fichero |",
  "| Docs del repo (README + NOTICE/CONTRIBUTING/SECURITY/CHANGELOG) | pendiente | media | — | El README documenta el stack heredado (Postgres/LiteLLM/SearXNG) que ya no existe; T0.4 pendiente de contenido |",
  "| Gestionar tus cambios sin commitear | pendiente | baja | — | Staged de `main` (opencode-review.yml, code-reviewer.txt) y swaps de modelo en `opencode.json` |",
  "| Opcional: fijar actions por SHA, visibilidad GHCR, limpiar ramas `opencode/issue*` y reflog | pendiente | baja | — | Endurecimiento de CI y limpieza; detalle en la nota `T0.1-informe-pipeline-HITL` |",
  "| Fix revisión intermedia (writeObjectFile + caché) | hecha | media | 2026-10-06 | Dos footguns de pérdida de datos en la API pública y coste O(vault) por operación |",
  "| Recuperación de T1.5 (wikilinks + rename) | hecha | alta | 2026-10-06 | El subagente se colgó en bucle con el trabajo sin commitear; se completó desde el worktree |",
  "| Config anti-bucle (steps, doom_loop, timeouts, prompts) | hecha | alta | 2026-10-06 | Sin tope de iteraciones un subagente podía girar indefinidamente; ya verificado en los reviews de cierre |",
  "| Fix seguridad de cierre (symlinks, escrituras atómicas, roturas visibles) | hecha | alta | 2026-10-06 | Escape del vault por symlinks (ALTA) + integridad de escritura; exigido antes de merge |",
  "| Hardening de cobertura (ramas de salvage/rename) | pospuesta | baja | — | Los umbrales ya se cumplen (95%/89%); el test-architect falló por caída del endpoint `mimo-v2.6-pro` |",
  "| Deudas M1 (semántica addAttribute, validación de `links`, case-sensitivity de raíces, rutas en errores, `parseDotenv` con `#`, escape i18n/XSS) | pospuesta | baja | — | Hallazgos BAJO de las revisiones de cierre; sin impacto hasta exponer API/UI (M3/M4) |",
];

const BOARD_BODY = `${BOARD_ROWS.join("\n")}\n`;

export type BoardNoteResult = {
  action: "created" | "updated";
  object: ObjectRecord;
};

export const createBoardNote = (vaultDir: string, timeZone: string): BoardNoteResult => {
  bootstrapVault(vaultDir);
  const repository = createObjectRepository({ vaultDir, timeZone });
  const existing = repository.findObjectByTitle(BOARD_TITLE);
  const object =
    existing === undefined
      ? repository.createObject({
          title: BOARD_TITLE,
          type: "nota",
          folder: "",
          body: BOARD_BODY,
        })
      : repository.updateObject(existing.id, { body: BOARD_BODY });
  const read = repository.readObject(object.id);
  if (!read.ok) {
    throw new Error(`"${BOARD_TITLE}" no parsea: ${read.problems.join("; ")}`);
  }
  return { action: existing === undefined ? "created" : "updated", object: read.object };
};

const result = createBoardNote(VAULT_DIR, TIME_ZONE);
console.log(`${result.action}: ${result.object.path}`);
console.log(result.object.body);
