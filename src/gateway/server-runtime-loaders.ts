import type { GatewayRequestHandlers } from "./server-methods/types.js";

export type GatewayCommandSecretAssignment = {
  path: string;
  pathSegments: string[];
  value: unknown;
};

export type GatewaySecretsHandlersDeps = {
  reloadSecrets: () => Promise<{ warningCount: number }>;
  resolveSecrets: (params: { commandName: string; targetIds: string[] }) => Promise<{
    assignments: GatewayCommandSecretAssignment[];
    diagnostics: string[];
    inactiveRefPaths: string[];
  }>;
};

type GatewaySecretsHandlersRuntime = {
  createSecretsHandlers: (params: GatewaySecretsHandlersDeps) => GatewayRequestHandlers;
};

type CommandSecretsRuntime = {
  resolveCommandSecretsFromActiveRuntimeSnapshot: (params: {
    commandName: string;
    targetIds: ReadonlySet<string>;
  }) => {
    assignments: GatewayCommandSecretAssignment[];
    diagnostics: string[];
    inactiveRefPaths: string[];
  };
};

let gatewaySecretsHandlersRuntimePromise: Promise<GatewaySecretsHandlersRuntime> | null = null;
let commandSecretsRuntimePromise: Promise<CommandSecretsRuntime> | null = null;

async function loadGatewaySecretsHandlersRuntime(): Promise<GatewaySecretsHandlersRuntime> {
  gatewaySecretsHandlersRuntimePromise ??= import("./server-methods/secrets.js");
  return await gatewaySecretsHandlersRuntimePromise;
}

async function loadCommandSecretsRuntime(): Promise<CommandSecretsRuntime> {
  commandSecretsRuntimePromise ??= import("../secrets/runtime-command-secrets.js");
  return await commandSecretsRuntimePromise;
}

export async function createLazySecretsHandlers(
  params: GatewaySecretsHandlersDeps,
): Promise<GatewayRequestHandlers> {
  const { createSecretsHandlers } = await loadGatewaySecretsHandlersRuntime();
  return createSecretsHandlers(params);
}

export async function resolveCommandSecretsFromRuntimeSnapshot(params: {
  commandName: string;
  targetIds: ReadonlySet<string>;
}): Promise<{
  assignments: GatewayCommandSecretAssignment[];
  diagnostics: string[];
  inactiveRefPaths: string[];
}> {
  const { resolveCommandSecretsFromActiveRuntimeSnapshot } = await loadCommandSecretsRuntime();
  return resolveCommandSecretsFromActiveRuntimeSnapshot(params);
}
