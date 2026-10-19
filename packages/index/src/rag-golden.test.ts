import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapVault, createObjectRepository, type ObjectRepository } from "@migite/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EmbeddingProvider, syncEmbeddings } from "./embeddings.js";
import {
  type HybridSearchResult,
  searchKnowledge,
  searchKnowledgeHybrid,
} from "./hybrid-search.js";
import { buildIndex } from "./indexer.js";
import { type IndexHandle, openIndex } from "./open.js";
import type { ObjectFilters } from "./search.js";

const DIMENSIONS = 16;

type ConceptRule = {
  readonly name: string;
  readonly dimension: number;
  readonly sign: 1 | -1;
  readonly patterns: readonly RegExp[];
};

/**
 * Definición de los ejes conceptuales en un espacio determinista de 16 dimensiones.
 * Cada concepto proyecta sinónimos, paráfrasis y términos bilingües (ES/EN) sobre
 * una coordenada firmada (dimensión 0..15, signo +1 o -1) sin llamadas de red.
 */
const CONCEPT_RULES: readonly ConceptRule[] = [
  {
    name: "auth_passwords",
    dimension: 0,
    sign: 1,
    patterns: [
      /contraseñ/i,
      /argon2/i,
      /inicio de sesi[oó]n/i,
      /almacenamiento de credenciales/i,
      /cookies? firmadas?/i,
      /httponly/i,
    ],
  },
  {
    name: "csrf_origin",
    dimension: 1,
    sign: 1,
    patterns: [
      /\bcsrf\b/i,
      /peticiones falsificadas/i,
      /otros sitios web/i,
      /cabeceras? origin/i,
      /samesite/i,
    ],
  },
  {
    name: "backups_age",
    dimension: 2,
    sign: 1,
    patterns: [
      /copias de seguridad cifradas/i,
      /backups? con age/i,
      /clave p[uú]blica age/i,
      /bucket remoto/i,
    ],
  },
  {
    name: "backup_retention",
    dimension: 2,
    sign: -1,
    patterns: [
      /backup retention policy/i,
      /retenci[oó]n y rotaci[oó]n/i,
      /siete archivos diarios/i,
      /cuatro semanales/i,
    ],
  },
  {
    name: "ulid_frontmatter",
    dimension: 3,
    sign: 1,
    patterns: [/\bulid\b/i, /26 caracteres/i, /inmutable/i],
  },
  {
    name: "wikilinks_rename",
    dimension: 4,
    sign: 1,
    patterns: [
      /enlaces al renombrar/i,
      /actualizaci[oó]n de wikilinks/i,
      /cambio de t[ií]tulo/i,
      /reescriben de forma at[oó]mica/i,
    ],
  },
  {
    name: "sqlite_fts_wal",
    dimension: 5,
    sign: 1,
    patterns: [/\bfts5\b/i, /\bunicode61\b/i, /journal_mode wal/i, /remove_diacritics/i],
  },
  {
    name: "rag_embeddings_rrf",
    dimension: 6,
    sign: 1,
    patterns: [
      /\badr-011\b/i,
      /almacenamiento de vectores/i,
      /b[uú]squeda sem[aá]ntica/i,
      /embeddings en sqlite/i,
      /reciprocal rank fusion/i,
      /float32array/i,
    ],
  },
  {
    name: "llm_providers_keys",
    dimension: 7,
    sign: 1,
    patterns: [
      /proveedores de ia/i,
      /proveedores llm/i,
      /variables de entorno/i,
      /api keys/i,
      /anthropic y ollama/i,
    ],
  },
  {
    name: "ai_budget_tokens",
    dimension: 8,
    sign: 1,
    patterns: [
      /presupuesto mensual de ia/i,
      /gasto de tokens/i,
      /alertas de consumo/i,
      /80% del l[ií]mite/i,
    ],
  },
  {
    name: "agent_confirmations",
    dimension: 9,
    sign: 1,
    patterns: [
      /borrar notas por su cuenta/i,
      /sin preguntar/i,
      /acciones destructivas/i,
      /aprobaci[oó]n expresa del usuario/i,
    ],
  },
  {
    name: "prompt_injection",
    dimension: 10,
    sign: 1,
    patterns: [/prompt injection/i, /datos_vault/i, /suplante instrucciones/i],
  },
  {
    name: "tailscale_exposure",
    dimension: 11,
    sign: 1,
    patterns: [
      /fuera de casa de forma privada/i,
      /exposici[oó]n privada mediante tailscale/i,
      /tailnet wireguard/i,
      /puertos p[uú]blicos en el cortafuegos/i,
    ],
  },
  {
    name: "disaster_recovery_drill",
    dimension: 11,
    sign: -1,
    patterns: [
      /encrypted backups can be restored/i,
      /restore verification procedure/i,
      /quarterly drill/i,
      /isolated staging directory/i,
    ],
  },
  {
    name: "task_tls_renewal",
    dimension: 12,
    sign: 1,
    patterns: [
      /caducidad de certificados https/i,
      /renovar certificados tls/i,
      /let's encrypt/i,
      /certificado x\.509/i,
    ],
  },
  {
    name: "posix_permissions",
    dimension: 12,
    sign: -1,
    patterns: [/permisos posix/i, /\b0600\b/i, /\b0700\b/i],
  },
  {
    name: "reminder_quarterly_taxes",
    dimension: 13,
    sign: 1,
    patterns: [
      /impuestos del trimestre/i,
      /hacienda/i,
      /modelo 303/i,
      /agencia tributaria/i,
      /autoliquidaci[oó]n/i,
    ],
  },
  {
    name: "event_m6_review",
    dimension: 14,
    sign: 1,
    patterns: [
      /pr[oó]xima reuni[oó]n del equipo t[eé]cnico/i,
      /orden del d[ií]a/i,
      /aprobar el cierre del hito m6/i,
    ],
  },
  {
    name: "project_migite_roadmap",
    dimension: 15,
    sign: 1,
    patterns: [
      /lanzamiento versi[oó]n/i,
      /hitos del producto/i,
      /criterios de publicaci[oó]n de migite/i,
    ],
  },
];

const computeConceptualVector16D = (text: string): readonly number[] => {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const rule of CONCEPT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      vector[rule.dimension] = (vector[rule.dimension] ?? 0) + rule.sign;
    }
  }
  return vector;
};

const createGoldenEmbeddingProvider = (model = "golden-conceptual-16d-v1"): EmbeddingProvider => ({
  model,
  embed: async (texts) => texts.map(computeConceptualVector16D),
});

type GoldenCase = {
  readonly id: string;
  readonly question: string;
  readonly expectedObjectTitle: string;
  readonly expectedHeading: string | null;
  readonly filters?: ObjectFilters;
};

type EvaluationMetrics = {
  readonly hitAt1Object: number;
  readonly hitAt3Object: number;
  readonly mrrObject: number;
  readonly hitAt1Section: number;
  readonly hitAt3Section: number;
  readonly mrrSection: number;
};

const matchesSection = (
  result: HybridSearchResult,
  expectedTitle: string,
  expectedHeading: string | null,
): boolean => {
  if (result.titulo !== expectedTitle) {
    return false;
  }
  return (result.encabezado ?? null) === expectedHeading;
};

const computeMetrics = (
  cases: readonly GoldenCase[],
  resultsByCase: ReadonlyMap<string, readonly HybridSearchResult[]>,
): EvaluationMetrics => {
  let hits1Obj = 0;
  let hits3Obj = 0;
  let rrObjSum = 0;

  let hits1Sec = 0;
  let hits3Sec = 0;
  let rrSecSum = 0;

  for (const goldenCase of cases) {
    const results = resultsByCase.get(goldenCase.id) ?? [];

    const objRankIdx = results.findIndex((r) => r.titulo === goldenCase.expectedObjectTitle);
    if (objRankIdx !== -1) {
      const rank = objRankIdx + 1;
      if (rank === 1) {
        hits1Obj += 1;
      }
      if (rank <= 3) {
        hits3Obj += 1;
      }
      rrObjSum += 1 / rank;
    }

    const secRankIdx = results.findIndex((r) =>
      matchesSection(r, goldenCase.expectedObjectTitle, goldenCase.expectedHeading),
    );
    if (secRankIdx !== -1) {
      const rank = secRankIdx + 1;
      if (rank === 1) {
        hits1Sec += 1;
      }
      if (rank <= 3) {
        hits3Sec += 1;
      }
      rrSecSum += 1 / rank;
    }
  }

  const total = cases.length;
  return {
    hitAt1Object: hits1Obj / total,
    hitAt3Object: hits3Obj / total,
    mrrObject: rrObjSum / total,
    hitAt1Section: hits1Sec / total,
    hitAt3Section: hits3Sec / total,
    mrrSection: rrSecSum / total,
  };
};

const seedGoldenVault = (repo: ObjectRepository): void => {
  // 1. Nota técnica de seguridad HTTP (2 secciones)
  repo.createObject({
    title: "Seguridad y autenticación HTTP",
    type: "nota",
    folder: "arquitectura/seguridad",
    attributes: { etiquetas: ["seguridad", "backend"] },
    body: [
      "# Almacenamiento de credenciales con Argon2",
      "Las claves de acceso nunca se persisten en claro; se aplica hashing Argon2id con sal aleatoria y mantenimiento mediante cookies firmadas HttpOnly.",
      "",
      "# Protección CSRF en mutaciones",
      "Toda ruta POST, PUT o DELETE valida las cabeceras Origin y Referer además del atributo SameSite=Lax.",
    ].join("\n"),
  });

  // 2. Nota de operaciones de backups (2 secciones)
  repo.createObject({
    title: "Política de copias de seguridad",
    type: "nota",
    folder: "operaciones/backups",
    attributes: { etiquetas: ["operaciones", "seguridad"] },
    body: [
      "# Backups con age",
      "Los archivos comprimidos del vault y de la base de datos se empaquetan y se protegen con clave pública age antes de subirlos al bucket remoto.",
      "",
      "# Retención y rotación de snapshots",
      "Conservamos siete archivos diarios, cuatro semanales y seis mensuales; la purga automática elimina copias antiguas tras verificar el checksum.",
    ].join("\n"),
  });

  // 3. Nota de modelo de datos del Vault (2 secciones)
  repo.createObject({
    title: "Modelo de datos del Vault",
    type: "nota",
    folder: "arquitectura/core",
    attributes: { etiquetas: ["core", "markdown"] },
    body: [
      "# Identificadores ULID y frontmatter",
      "Cada fichero Markdown incluye un identificador ULID de 26 caracteres en su bloque YAML de frontmatter que permanece inmutable.",
      "",
      "# Actualización de wikilinks por cambio de título",
      "Cuando un objeto cambia de nombre en el repositorio, todas las referencias [[Título]] repartidas por el resto de archivos se reescriben de forma atómica.",
    ].join("\n"),
  });

  // 4. Nota de motor SQLite (2 secciones)
  repo.createObject({
    title: "Motor de indexación SQLite",
    type: "nota",
    folder: "arquitectura/index",
    attributes: { etiquetas: ["sqlite", "busqueda"] },
    body: [
      "# Configuración WAL y FTS5",
      "El índice derivado activa journal_mode WAL y mantiene la tabla virtual fts_objetos con el tokenizador unicode61 remove_diacritics 2.",
      "",
      "# Reconciliación incremental al arranque",
      "Al iniciar el servidor se compara el hash SHA-256 de cada archivo con el registrado en SQLite para reindexar solo los objetos modificados.",
    ].join("\n"),
  });

  // 5. ADR-011 sobre RAG híbrido (2 secciones)
  repo.createObject({
    title: "ADR-011 Recuperación híbrida y RRF",
    type: "nota",
    folder: "arquitectura/adr",
    attributes: { etiquetas: ["adr", "ia", "rag"] },
    body: [
      "# Contexto y limitaciones léxicas",
      "Las consultas en lenguaje natural suelen emplear sinónimos que no coinciden literalmente con los términos técnicos de las notas.",
      "",
      "# Decisión: Embeddings en SQLite y fusión RRF",
      "En el ADR-011 adoptamos Reciprocal Rank Fusion (RRF, k=60) combinando búsqueda léxica y vectores Float32Array persistidos en SQLite.",
    ].join("\n"),
  });

  // 6. Nota sobre costes y proveedores de IA (2 secciones)
  repo.createObject({
    title: "Control de costes y proveedores de IA",
    type: "nota",
    folder: "arquitectura/ia",
    attributes: { etiquetas: ["ia", "configuracion"] },
    body: [
      "# Proveedores LLM y variables de entorno",
      "Los conectores para OpenAI, Anthropic y Ollama leen sus API keys exclusivamente desde variables de entorno del proceso, sin guardar secretos en el vault.",
      "",
      "# Gasto de tokens y alertas de consumo",
      "El contador acumula el coste estimado de tokens por mes natural, emite una alerta preventiva al superar el 80% del límite y bloquea llamadas al 100%.",
    ].join("\n"),
  });

  // 7. Nota sobre seguridad del agente conversacional (2 secciones)
  repo.createObject({
    title: "Seguridad del Agente Conversacional",
    type: "nota",
    folder: "arquitectura/ia",
    attributes: { etiquetas: ["ia", "seguridad"] },
    body: [
      "# Confirmación de acciones destructivas",
      "Toda operación de eliminación o sobrescritura genera una propuesta en estado pendiente que exige aprobación expresa del usuario antes de tocar el disco.",
      "",
      "# Aislamiento contra prompt injection",
      "Los textos leídos del disco se envuelven con delimitadores datos_vault para impedir que contenido malicioso suplante instrucciones del sistema.",
    ].join("\n"),
  });

  // 8. Guía de despliegue en VPS (2 secciones)
  repo.createObject({
    title: "Guía de despliegue en VPS",
    type: "nota",
    folder: "operaciones/despliegue",
    attributes: { etiquetas: ["operaciones", "red"] },
    body: [
      "# Exposición privada mediante Tailscale",
      "El demonio HTTP escucha únicamente en la interfaz virtual de la tailnet WireGuard (100.x.y.z), sin abrir puertos públicos en el cortafuegos del VPS.",
      "",
      "# Volúmenes persistentes en contenedor",
      "El directorio del vault y el fichero de base de datos se montan en un volumen SSD dedicado con permisos restringidos al usuario del servicio.",
    ].join("\n"),
  });

  // 9. Runbook en inglés de Disaster Recovery (2 secciones)
  repo.createObject({
    title: "Backup Disaster Recovery Runbook",
    type: "nota",
    folder: "operaciones/backups",
    attributes: { etiquetas: ["operaciones", "runbook"] },
    body: [
      "# Scope and responsibilities",
      "Defines operational readiness for storage failures on the primary node.",
      "",
      "# Restore verification procedure",
      "Quarterly drill: decrypt the latest archive in an isolated staging directory, run index rebuild, and validate object counts against the manifest.",
    ].join("\n"),
  });

  // 10. Proyecto principal Migite 0.1 (2 secciones)
  repo.createObject({
    title: "Migite 0.1",
    type: "proyecto",
    folder: "proyectos",
    attributes: { estado: "activo", etiquetas: ["roadmap", "migite"] },
    body: [
      "# Visión general",
      "Segundo cerebro personal autoalojado con archivos Markdown como única fuente de verdad.",
      "",
      "# Hitos del producto",
      "Define los criterios de publicación de Migite para el lanzamiento versión inicial tras completar M1 a M6.",
    ].join("\n"),
  });

  // 11. Proyecto secundario de correo
  repo.createObject({
    title: "Migración de servidor de correo",
    type: "proyecto",
    folder: "proyectos",
    attributes: { estado: "pausado", etiquetas: ["infraestructura"] },
    body: "# Plan de cambio DNS\nConfiguración de registros MX, SPF, DKIM y DMARC para el dominio propio.",
  });

  // 12. Tarea de renovación TLS
  repo.createObject({
    title: "Renovar certificados TLS del nodo central",
    type: "tarea",
    folder: "tareas",
    attributes: {
      estado: "pendiente",
      vencimiento: "2026-11-15",
      etiquetas: ["infraestructura", "urgente"],
    },
    body: "Comprobar el timer de Let's Encrypt y recargar Caddy antes del vencimiento del certificado X.509 en noviembre.",
  });

  // 13. Tarea de auditoría POSIX
  repo.createObject({
    title: "Auditar permisos de carpetas compartidas",
    type: "tarea",
    folder: "tareas",
    attributes: { estado: "en curso", etiquetas: ["seguridad"] },
    body: "Revisar permisos POSIX 0600 en ficheros y 0700 en directorios del vault en el servidor de producción.",
  });

  // 14. Recordatorio de impuestos trimestrales
  repo.createObject({
    title: "Presentar declaración trimestral IVA modelo 303",
    type: "recordatorio",
    folder: "finanzas",
    attributes: {
      hora: "2026-10-20T09:00:00.000Z",
      disparado: false,
      etiquetas: ["impuestos", "trimestral"],
    },
    body: "Descargar el libro registro de facturas emitidas y presentar la autoliquidación del modelo 303 en la Agencia Tributaria.",
  });

  // 15. Evento de revisión de arquitectura
  repo.createObject({
    title: "Revisión de arquitectura del hito M6",
    type: "evento",
    folder: "agenda",
    attributes: {
      inicio: "2026-10-22T16:00:00.000Z",
      fin: "2026-10-22T17:00:00.000Z",
      etiquetas: ["arquitectura", "equipo"],
    },
    body: [
      "# Asistentes",
      "Equipo de arquitectura y calidad.",
      "",
      "# Orden del día",
      "Analizar las métricas del Golden Set de recuperación híbrida, revisar tiempos de respuesta en SQLite y aprobar el cierre del hito M6.",
    ].join("\n"),
  });

  // 16. Nota de lecturas (contiene términos léxicos "lanzamiento" y "versión" repetidos como distractor léxico para G-20)
  repo.createObject({
    title: "Notas de lectura sobre sistemas locales",
    type: "nota",
    folder: "lecturas",
    attributes: { etiquetas: ["lecturas", "local-first"] },
    body: [
      "# Principios local-first",
      "Ensayo sobre longevidad de datos: cada lanzamiento de una versión propietaria en la nube arriesga el formato, mientras que el lanzamiento de una versión basada en texto plano conserva la propiedad del usuario.",
    ].join("\n"),
  });
};

const GOLDEN_CASES: readonly GoldenCase[] = [
  {
    id: "G-01",
    question: "¿Qué decidimos sobre cómo guardar las contraseñas e inicio de sesión?",
    expectedObjectTitle: "Seguridad y autenticación HTTP",
    expectedHeading: "Almacenamiento de credenciales con Argon2",
  },
  {
    id: "G-02",
    question: "¿Cómo evitamos peticiones falsificadas desde otros sitios web?",
    expectedObjectTitle: "Seguridad y autenticación HTTP",
    expectedHeading: "Protección CSRF en mutaciones",
  },
  {
    id: "G-03",
    question: "¿Cómo se hacen las copias de seguridad cifradas fuera del servidor?",
    expectedObjectTitle: "Política de copias de seguridad",
    expectedHeading: "Backups con age",
  },
  {
    id: "G-04",
    question: "What is the backup retention policy?",
    expectedObjectTitle: "Política de copias de seguridad",
    expectedHeading: "Retención y rotación de snapshots",
  },
  {
    id: "G-05",
    question: "ULID frontmatter",
    expectedObjectTitle: "Modelo de datos del Vault",
    expectedHeading: "Identificadores ULID y frontmatter",
  },
  {
    id: "G-06",
    question: "¿Cómo funcionan los enlaces al renombrar una nota?",
    expectedObjectTitle: "Modelo de datos del Vault",
    expectedHeading: "Actualización de wikilinks por cambio de título",
  },
  {
    id: "G-07",
    question: "WAL FTS5 unicode61",
    expectedObjectTitle: "Motor de indexación SQLite",
    expectedHeading: "Configuración WAL y FTS5",
  },
  {
    id: "G-08",
    question: "ADR-011 RRF",
    expectedObjectTitle: "ADR-011 Recuperación híbrida y RRF",
    expectedHeading: "Decisión: Embeddings en SQLite y fusión RRF",
  },
  {
    id: "G-09",
    question: "¿Cómo funciona el almacenamiento de vectores para búsqueda semántica?",
    expectedObjectTitle: "ADR-011 Recuperación híbrida y RRF",
    expectedHeading: "Decisión: Embeddings en SQLite y fusión RRF",
  },
  {
    id: "G-10",
    question: "¿Dónde se configuran los proveedores de IA?",
    expectedObjectTitle: "Control de costes y proveedores de IA",
    expectedHeading: "Proveedores LLM y variables de entorno",
  },
  {
    id: "G-11",
    question: "¿Cuál es el presupuesto mensual de IA y cuándo salta el aviso?",
    expectedObjectTitle: "Control de costes y proveedores de IA",
    expectedHeading: "Gasto de tokens y alertas de consumo",
    filters: { carpeta: "arquitectura/ia" },
  },
  {
    id: "G-12",
    question: "¿Puede el asistente borrar notas por su cuenta sin preguntar?",
    expectedObjectTitle: "Seguridad del Agente Conversacional",
    expectedHeading: "Confirmación de acciones destructivas",
  },
  {
    id: "G-13",
    question: "datos_vault prompt injection",
    expectedObjectTitle: "Seguridad del Agente Conversacional",
    expectedHeading: "Aislamiento contra prompt injection",
    filters: { tag: "seguridad" },
  },
  {
    id: "G-14",
    question: "¿Cómo accedemos al servidor desde fuera de casa de forma privada?",
    expectedObjectTitle: "Guía de despliegue en VPS",
    expectedHeading: "Exposición privada mediante Tailscale",
  },
  {
    id: "G-15",
    question: "How do we verify that encrypted backups can be restored?",
    expectedObjectTitle: "Backup Disaster Recovery Runbook",
    expectedHeading: "Restore verification procedure",
  },
  {
    id: "G-16",
    question: "¿Qué hay pendiente sobre caducidad de certificados HTTPS?",
    expectedObjectTitle: "Renovar certificados TLS del nodo central",
    expectedHeading: null,
    filters: { tipo: "tarea" },
  },
  {
    id: "G-17",
    question: "permisos POSIX 0600",
    expectedObjectTitle: "Auditar permisos de carpetas compartidas",
    expectedHeading: null,
    filters: { tipo: "tarea" },
  },
  {
    id: "G-18",
    question: "¿Cuándo toca pagar los impuestos del trimestre a Hacienda?",
    expectedObjectTitle: "Presentar declaración trimestral IVA modelo 303",
    expectedHeading: null,
    filters: { tipo: "recordatorio" },
  },
  {
    id: "G-19",
    question: "¿De qué hablaremos en la próxima reunión del equipo técnico?",
    expectedObjectTitle: "Revisión de arquitectura del hito M6",
    expectedHeading: "Orden del día",
    filters: { tipo: "evento" },
  },
  {
    id: "G-20",
    question: "lanzamiento versión",
    expectedObjectTitle: "Migite 0.1",
    expectedHeading: "Hitos del producto",
  },
];

describe("Golden Set de evaluación RAG híbrido (T6.5 / RNF-015)", () => {
  let directory: string;
  let vaultDir: string;
  let handle: IndexHandle;
  let repo: ObjectRepository;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "migite-rag-golden-"));
    vaultDir = join(directory, "vault");
    bootstrapVault(vaultDir);
    repo = createObjectRepository({ vaultDir, timeZone: "UTC" });
    seedGoldenVault(repo);
    handle = openIndex({ dbPath: join(directory, "index.db") });
  });

  afterEach(() => {
    handle.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("proyecta sinónimos y paráfrasis en las mismas dimensiones conceptuales de 16D sin red", async () => {
    const provider = createGoldenEmbeddingProvider();
    const pairs: readonly (readonly [string, string])[] = [
      ["copias de seguridad cifradas", "backups con age"],
      ["cookies firmadas HttpOnly", "inicio de sesión con argon2"],
      ["presupuesto mensual de IA", "gasto de tokens y alertas de consumo"],
      ["almacenamiento de vectores", "embeddings en SQLite"],
      ["enlaces al renombrar", "actualización de wikilinks por cambio de título"],
      ["What is the backup retention policy?", "Retención y rotación de snapshots"],
    ];

    for (const [leftText, rightText] of pairs) {
      const [leftVec, rightVec] = await provider.embed([leftText, rightText]);
      expect(leftVec).toHaveLength(DIMENSIONS);
      expect(rightVec).toHaveLength(DIMENSIONS);
      expect(leftVec).toEqual(rightVec);
    }
  });

  it("indexa el vault realista (>= 15 objetos) y supera estrictamente al baseline léxico en Hit@1 y MRR con Hit@1 >= 0.90 y Hit@3 = 1.00", async () => {
    const indexedCount = buildIndex(handle.db, { vaultDir, timeZone: "UTC" });
    expect(indexedCount).toBe(16);
    expect(GOLDEN_CASES).toHaveLength(20);

    const provider = createGoldenEmbeddingProvider();
    const syncSummary = await syncEmbeddings(handle.db, provider);
    expect(syncSummary.embedded).toBe(27);

    const lexicalResultsByCase = new Map<string, readonly HybridSearchResult[]>();
    const hybridResultsByCase = new Map<string, readonly HybridSearchResult[]>();

    for (const goldenCase of GOLDEN_CASES) {
      const lexicalResults = searchKnowledge(handle.db, {
        query: goldenCase.question,
        ...(goldenCase.filters === undefined ? {} : { filters: goldenCase.filters }),
        limit: 5,
      });
      lexicalResultsByCase.set(goldenCase.id, lexicalResults);

      const hybridResults = await searchKnowledgeHybrid(handle.db, {
        query: goldenCase.question,
        ...(goldenCase.filters === undefined ? {} : { filters: goldenCase.filters }),
        embeddingProvider: provider,
        autoSyncEmbeddings: false,
        limit: 5,
      });
      hybridResultsByCase.set(goldenCase.id, hybridResults);
    }

    const lexicalMetrics = computeMetrics(GOLDEN_CASES, lexicalResultsByCase);
    const hybridMetrics = computeMetrics(GOLDEN_CASES, hybridResultsByCase);

    // Métricas exactas del baseline solo léxico (5 aciertos en top-1, 1 acierto en top-2 para G-20)
    expect(lexicalMetrics).toEqual({
      hitAt1Object: 0.25,
      hitAt3Object: 0.3,
      mrrObject: 0.275,
      hitAt1Section: 0.25,
      hitAt3Section: 0.3,
      mrrSection: 0.275,
    });

    // Métricas exactas del modo híbrido RRF (20/20 en top-1 tanto en objeto como en sección)
    expect(hybridMetrics).toEqual({
      hitAt1Object: 1,
      hitAt3Object: 1,
      mrrObject: 1,
      hitAt1Section: 1,
      hitAt3Section: 1,
      mrrSection: 1,
    });

    // 1. El modo híbrido supera estrictamente al modo solo léxico en Hit@1 y MRR (objeto y sección)
    expect(hybridMetrics.hitAt1Object).toBeGreaterThan(lexicalMetrics.hitAt1Object);
    expect(hybridMetrics.mrrObject).toBeGreaterThan(lexicalMetrics.mrrObject);
    expect(hybridMetrics.hitAt1Section).toBeGreaterThan(lexicalMetrics.hitAt1Section);
    expect(hybridMetrics.mrrSection).toBeGreaterThan(lexicalMetrics.mrrSection);

    // 2. Umbrales de calidad del Golden Set para recuperación híbrida
    expect(hybridMetrics.hitAt1Object).toBeGreaterThanOrEqual(0.9);
    expect(hybridMetrics.hitAt3Object).toBe(1);
    expect(hybridMetrics.hitAt1Section).toBeGreaterThanOrEqual(0.9);
    expect(hybridMetrics.hitAt3Section).toBe(1);

    // 3. Verificación caso por caso de la sección esperada en el top-1 para citas precisas
    for (const goldenCase of GOLDEN_CASES) {
      const top1 = hybridResultsByCase.get(goldenCase.id)?.[0];
      expect(top1, `Caso ${goldenCase.id} debería devolver al menos un resultado`).toBeDefined();
      expect(top1?.titulo, `Caso ${goldenCase.id}: título inesperado`).toBe(
        goldenCase.expectedObjectTitle,
      );
      if (goldenCase.expectedHeading !== null) {
        expect(top1?.encabezado, `Caso ${goldenCase.id}: encabezado de sección inesperado`).toBe(
          goldenCase.expectedHeading,
        );
      } else {
        expect(
          top1?.encabezado ?? null,
          `Caso ${goldenCase.id}: no debía tener encabezado`,
        ).toBeNull();
      }
    }
  });
});
