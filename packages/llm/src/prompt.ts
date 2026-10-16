import { type Locale, type TranslationKey, t } from "@migite/core";

export const LIMITE_MEMORIAS_PROMPT = 20;

export const LIMITE_CONTENIDO_MEMORIA_PROMPT = 200;

export const DELIMITADOR_DATOS_VAULT_INICIO = "<datos_vault>";

export const DELIMITADOR_DATOS_VAULT_FIN = "</datos_vault>";

export const envolverDatosVault = (contenido: string): string =>
  `${DELIMITADOR_DATOS_VAULT_INICIO}\n${contenido}\n${DELIMITADOR_DATOS_VAULT_FIN}`;

export type MemoriaContexto = {
  readonly clave: string;
  readonly contenido: string;
};

export interface BuildSystemPromptOptions {
  readonly locale?: Locale;
  readonly memorias?: readonly MemoriaContexto[];
}

const RULE_KEYS = [
  "agent.systemPrompt.rules.language",
  "agent.systemPrompt.rules.sources",
  "agent.systemPrompt.rules.confirmation",
  "agent.systemPrompt.rules.noDirectWrites",
  "agent.systemPrompt.rules.dataNotInstructions",
] as const satisfies readonly TranslationKey[];

const recortarContenido = (contenido: string): string => {
  const plano = contenido.replace(/\s+/g, " ").trim();
  return plano.length <= LIMITE_CONTENIDO_MEMORIA_PROMPT
    ? plano
    : `${plano.slice(0, LIMITE_CONTENIDO_MEMORIA_PROMPT).trimEnd()}…`;
};

const seccionMemoria = (
  memorias: readonly MemoriaContexto[],
  locale: Locale | undefined,
): readonly string[] => {
  if (memorias.length === 0) {
    return [];
  }
  const bloque = [
    t("agent.systemPrompt.memory.title", undefined, locale),
    t("agent.systemPrompt.memory.notice", undefined, locale),
    ...memorias
      .slice(0, LIMITE_MEMORIAS_PROMPT)
      .map((memoria) => `- ${memoria.clave}: ${recortarContenido(memoria.contenido)}`),
  ].join("\n");
  return ["", envolverDatosVault(bloque)];
};

export const buildSystemPrompt = (options: BuildSystemPromptOptions = {}): string => {
  const intro = t("agent.systemPrompt.intro", undefined, options.locale);
  const rules = RULE_KEYS.map((key) => `- ${t(key, undefined, options.locale)}`);
  return [intro, "", ...rules, ...seccionMemoria(options.memorias ?? [], options.locale)].join(
    "\n",
  );
};
