import type { LlmConfig, LlmRole, RoleAssignment } from "@migite/core";
import { LlmError } from "./errors.js";

export interface ResolvedRoleModel {
  readonly providerId: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKeyEnv: string;
}

export const resolveRoleModel = (llm: LlmConfig, role: LlmRole): ResolvedRoleModel => {
  const assignments: Readonly<Partial<Record<LlmRole, RoleAssignment>>> = llm.roles;
  const assignment = assignments[role];
  if (assignment === undefined) {
    throw new LlmError(`el rol "${role}" no está configurado en config/llm.yaml`);
  }

  const provider = llm.providers.find((candidate) => candidate.id === assignment.provider);
  if (provider === undefined) {
    throw new LlmError(
      `el rol "${role}" apunta al proveedor "${assignment.provider}", que no está declarado en config/llm.yaml`,
    );
  }

  return {
    providerId: provider.id,
    model: assignment.model,
    baseUrl: provider.baseUrl,
    apiKeyEnv: provider.apiKeyEnv,
  };
};
