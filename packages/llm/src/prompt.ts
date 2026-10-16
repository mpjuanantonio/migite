import { type Locale, type TranslationKey, t } from "@migite/core";

export interface BuildSystemPromptOptions {
  readonly locale?: Locale;
}

const RULE_KEYS = [
  "agent.systemPrompt.rules.language",
  "agent.systemPrompt.rules.sources",
  "agent.systemPrompt.rules.confirmation",
  "agent.systemPrompt.rules.noDirectWrites",
] as const satisfies readonly TranslationKey[];

export const buildSystemPrompt = (options: BuildSystemPromptOptions = {}): string => {
  const intro = t("agent.systemPrompt.intro", undefined, options.locale);
  const rules = RULE_KEYS.map((key) => `- ${t(key, undefined, options.locale)}`);
  return [intro, "", ...rules].join("\n");
};
