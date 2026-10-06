import { z } from "zod";
import { type Locale, locales, t } from "../i18n/index.js";

export const ROLES = ["chat", "retrieve", "summarize", "embeddings"] as const;

export type LlmRole = (typeof ROLES)[number];

export const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone });
    return formatter.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

const nonEmptyText = (locale: Locale) =>
  z
    .string()
    .trim()
    .min(1, t("error.emptyValue", undefined, locale));

const envVarName = (locale: Locale) =>
  z.string().regex(ENV_VAR_PATTERN, t("error.invalidEnvVarName", undefined, locale));

const httpUrl = (locale: Locale) =>
  nonEmptyText(locale).pipe(
    z.url({ protocol: /^https?$/, error: t("error.invalidHttpUrl", undefined, locale) }),
  );

const timeZoneSchema = (locale: Locale) =>
  nonEmptyText(locale).refine(isValidTimeZone, t("error.invalidTimeZone", undefined, locale));

export const makeProviderSchema = (locale: Locale) =>
  z.strictObject({
    id: nonEmptyText(locale),
    baseUrl: httpUrl(locale),
    apiKeyEnv: envVarName(locale),
  });

export const makeRoleAssignmentSchema = (locale: Locale) =>
  z.strictObject({
    provider: nonEmptyText(locale),
    model: nonEmptyText(locale),
  });

export const makeAppSchema = (locale: Locale) =>
  z.strictObject({
    paths: z.strictObject({
      vault: nonEmptyText(locale),
      index: nonEmptyText(locale),
    }),
    timeZone: timeZoneSchema(locale),
    locale: z.enum(locales),
  });

export const makeLlmSchema = (locale: Locale) => {
  const providerSchema = makeProviderSchema(locale);
  const roleAssignmentSchema = makeRoleAssignmentSchema(locale);

  const roleShape = {
    chat: roleAssignmentSchema,
    retrieve: roleAssignmentSchema,
    summarize: roleAssignmentSchema,
    embeddings: roleAssignmentSchema,
  } satisfies Record<LlmRole, typeof roleAssignmentSchema>;

  const roles = z.strictObject(roleShape);

  return z
    .strictObject({
      providers: z.array(providerSchema).min(1, t("error.missingProvider", undefined, locale)),
      roles,
    })
    .superRefine((config, ctx) => {
      const ids = config.providers.map((provider) => provider.id);
      const declared = new Set<string>();

      for (const [index, id] of ids.entries()) {
        if (declared.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["providers", index, "id"],
            message: t("error.duplicateProviderId", { id }, locale),
          });
        }
        declared.add(id);
      }

      for (const role of ROLES) {
        const assignment = config.roles[role];
        if (!declared.has(assignment.provider)) {
          ctx.addIssue({
            code: "custom",
            path: ["roles", role, "provider"],
            message: t("error.undeclaredProvider", { provider: assignment.provider }, locale),
          });
        }
      }
    });
};

export type AppConfig = z.infer<ReturnType<typeof makeAppSchema>>;

export type LlmConfig = z.infer<ReturnType<typeof makeLlmSchema>>;

export type Provider = z.infer<ReturnType<typeof makeProviderSchema>>;

export type RoleAssignment = z.infer<ReturnType<typeof makeRoleAssignmentSchema>>;
