import {
  collectSecretInputAssignment,
  getChannelSurface,
  hasOwnProperty,
  isRecord,
  type ResolverContext,
  type SecretDefaults,
  type SecretTargetRegistryEntry,
} from "openclaw/plugin-sdk/security-runtime";

type VkTransport = "callback-api" | "long-poll";

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTransport(value: unknown, fallback: VkTransport = "callback-api"): VkTransport {
  const normalized = trimString(value).toLowerCase();
  switch (normalized) {
    case "callback":
    case "callback-api":
      return "callback-api";
    case "longpoll":
    case "long-poll":
      return "long-poll";
    default:
      return fallback;
  }
}

function hasOwnVkTokenSource(account: Record<string, unknown>): boolean {
  return hasOwnProperty(account, "accessToken") || hasOwnProperty(account, "tokenFile");
}

function getCallbackConfig(record: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(record.callback) ? record.callback : null;
}

function hasOwnVkCallbackSecret(account: Record<string, unknown>): boolean {
  const callback = getCallbackConfig(account);
  return callback ? hasOwnProperty(callback, "secret") : false;
}

function getEffectiveVkAccountTransport(
  account: Record<string, unknown>,
  baseTransport: VkTransport,
): VkTransport {
  return normalizeTransport(account.transport, baseTransport);
}

export const secretTargetRegistryEntries = [
  {
    id: "channels.vk.accounts.*.accessToken",
    targetType: "channels.vk.accounts.*.accessToken",
    configFile: "openclaw.json",
    pathPattern: "channels.vk.accounts.*.accessToken",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: "channels.vk.accounts.*.callback.secret",
    targetType: "channels.vk.accounts.*.callback.secret",
    configFile: "openclaw.json",
    pathPattern: "channels.vk.accounts.*.callback.secret",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: "channels.vk.accessToken",
    targetType: "channels.vk.accessToken",
    configFile: "openclaw.json",
    pathPattern: "channels.vk.accessToken",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: "channels.vk.callback.secret",
    targetType: "channels.vk.callback.secret",
    configFile: "openclaw.json",
    pathPattern: "channels.vk.callback.secret",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
] satisfies SecretTargetRegistryEntry[];

export function collectRuntimeConfigAssignments(params: {
  config: { channels?: Record<string, unknown> };
  defaults: SecretDefaults | undefined;
  context: ResolverContext;
}): void {
  const resolved = getChannelSurface(params.config, "vk");
  if (!resolved) {
    return;
  }

  const { channel: vk, surface } = resolved;
  const baseTransport = normalizeTransport(vk.transport);

  collectSecretInputAssignment({
    value: vk.accessToken,
    path: "channels.vk.accessToken",
    expected: "string",
    defaults: params.defaults,
    context: params.context,
    active:
      surface.channelEnabled &&
      (!surface.hasExplicitAccounts ||
        surface.accounts.some(({ account, enabled }) => enabled && !hasOwnVkTokenSource(account))),
    inactiveReason:
      "no enabled VK surface inherits this top-level accessToken because every enabled account defines its own token source.",
    apply: (value) => {
      vk.accessToken = value;
    },
  });

  const baseCallback = getCallbackConfig(vk);
  if (baseCallback) {
    collectSecretInputAssignment({
      value: baseCallback.secret,
      path: "channels.vk.callback.secret",
      expected: "string",
      defaults: params.defaults,
      context: params.context,
      active:
        surface.channelEnabled &&
        (!surface.hasExplicitAccounts
          ? baseTransport === "callback-api"
          : surface.accounts.some(
              ({ account, enabled }) =>
                enabled &&
                !hasOwnVkCallbackSecret(account) &&
                getEffectiveVkAccountTransport(account, baseTransport) === "callback-api",
            )),
      inactiveReason:
        "no enabled VK surface inherits this top-level callback.secret while using callback-api transport.",
      apply: (value) => {
        baseCallback.secret = value;
      },
    });
  }

  if (!surface.hasExplicitAccounts) {
    return;
  }

  for (const { accountId, account, enabled } of surface.accounts) {
    if (hasOwnProperty(account, "accessToken")) {
      collectSecretInputAssignment({
        value: account.accessToken,
        path: `channels.vk.accounts.${accountId}.accessToken`,
        expected: "string",
        defaults: params.defaults,
        context: params.context,
        active: enabled,
        inactiveReason: "VK account is disabled.",
        apply: (value) => {
          account.accessToken = value;
        },
      });
    }

    const callback = getCallbackConfig(account);
    if (!callback || !hasOwnProperty(callback, "secret")) {
      continue;
    }

    collectSecretInputAssignment({
      value: callback.secret,
      path: `channels.vk.accounts.${accountId}.callback.secret`,
      expected: "string",
      defaults: params.defaults,
      context: params.context,
      active: enabled && getEffectiveVkAccountTransport(account, baseTransport) === "callback-api",
      inactiveReason: "VK account is disabled or not using callback-api transport.",
      apply: (value) => {
        callback.secret = value;
      },
    });
  }
}
