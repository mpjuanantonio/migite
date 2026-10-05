import { z } from "zod";
import { locales, t } from "../i18n/index.js";

export const ROLES = ["chat", "retrieve", "summarize", "embeddings"] as const;

export type LlmRole = (typeof ROLES)[number];

export const ENV_VAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const nonEmptyText = z.string().trim().min(1, t("error.emptyValue"));

const envVarName = z.string().regex(ENV_VAR_PATTERN, t("error.invalidEnvVarName"));

const isValidTimeZone = (timeZone: string): boolean => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone });
    return formatter.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

const timeZone = nonEmptyText.refine(isValidTimeZone, t("error.invalidTimeZone"));

const httpUrl = nonEmptyText.pipe(
  z.url({ protocol: /^https?$/, error: t("error.invalidHttpUrl") }),
);

export const providerSchema = z.strictObject({
  id: nonEmptyText,
  baseUrl: httpUrl,
  apiKeyEnv: envVarName,
});

export const roleAssignmentSchema = z.strictObject({
  provider: nonEmptyText,
  model: nonEmptyText,
});

const roleShape = {
  chat: roleAssignmentSchema,
  retrieve: roleAssignmentSchema,
  summarize: roleAssignmentSchema,
  embeddings: roleAssignmentSchema,
} satisfies Record<LlmRole, typeof roleAssignmentSchema>;

const roles = z.strictObject(roleShape);

export const appSchema = z.strictObject({
  paths: z.strictObject({
    vault: nonEmptyText,
    index: nonEmptyText,
  }),
  timeZone,
  locale: z.enum(locales),
});

export const llmSchema = z
  .strictObject({
    providers: z.array(providerSchema).min(1, t("error.missingProvider")),
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
          message: t("error.duplicateProviderId", { id }),
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
          message: t("error.undeclaredProvider", { provider: assignment.provider }),
        });
      }
    }
  });

export type AppConfig = z.infer<typeof appSchema>;

export type LlmConfig = z.infer<typeof llmSchema>;

export type Provider = z.infer<typeof providerSchema>;

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
