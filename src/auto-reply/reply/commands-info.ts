import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import {
  resolveEffectiveToolInventory,
  type EffectiveToolInventoryResult,
  type ResolveEffectiveToolInventoryParams,
} from "../../agents/tools-effective-inventory.js";
import { getChannelPlugin } from "../../channels/plugins/index.js";
import { logVerbose } from "../../globals.js";
import { listSkillCommandsForAgents } from "../skill-commands.js";
import {
  buildCommandsMessage,
  buildCommandsMessagePaginated,
  buildHelpMessage,
  buildToolsMessage,
} from "../status.js";
import type { ReplyPayload } from "../types.js";
import { buildThreadingToolContext } from "./agent-runner-utils.js";
import { resolveChannelAccountId } from "./channel-context.js";
import { buildExportSessionReply } from "./commands-export-session.js";
import { buildStatusReply } from "./commands-status.js";
import type { CommandHandler } from "./commands-types.js";
import { extractExplicitGroupId } from "./group-id.js";
import { resolveReplyToMode } from "./reply-threading.js";
export { handleContextCommand } from "./commands-context-command.js";
export { handleWhoamiCommand } from "./commands-whoami.js";

const TOOLS_GROUPS_PER_PAGE = 6;
const TOOLS_PER_PAGE = 6;
const TOOLS_INVENTORY_CACHE_TTL_MS = 60_000;
const TOOLS_INVENTORY_CACHE_MAX_ENTRIES = 64;
const PLACEHOLDER_INTERACTIVE_TOOLS_GROUPS = [
  { id: "core", label: "Built-in tools", count: 0 },
  { id: "plugin", label: "Connected tools", count: 0 },
  { id: "channel", label: "Channel tools", count: 0 },
] as const;

type ToolsInventoryCacheEntry = {
  expiresAt: number;
  result: EffectiveToolInventoryResult;
};

const toolsInventoryCache = new Map<string, ToolsInventoryCacheEntry>();

type InteractiveToolsGroup = {
  id: string;
  label: string;
  tools: Array<{
    id: string;
    label: string;
    description: string;
    rawDescription: string;
    pluginId?: string;
    channelId?: string;
  }>;
};

type InteractiveToolsBrowseTarget =
  | { kind: "groups"; page: number }
  | { kind: "group"; groupId: string; page: number }
  | { kind: "tool"; groupId: string; toolId: string };

function hasInteractiveToolsSupport(commandPlugin: ReturnType<typeof getChannelPlugin>): boolean {
  return Boolean(
    commandPlugin?.commands?.buildToolsGroupListChannelData ||
    commandPlugin?.commands?.buildToolsListChannelData ||
    commandPlugin?.commands?.buildToolDetailsChannelData,
  );
}

function normalizeCacheKeyPart(value: string | number | boolean | null | undefined): string {
  if (value === true) {
    return "1";
  }
  if (value === false || value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeMessageContextCacheKeyPart(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    return "1";
  }
  return typeof value === "string" && value.trim().length > 0 ? "1" : "";
}

function pruneToolsInventoryCache(now: number): void {
  for (const [key, entry] of toolsInventoryCache) {
    if (entry.expiresAt <= now) {
      toolsInventoryCache.delete(key);
    }
  }

  while (toolsInventoryCache.size > TOOLS_INVENTORY_CACHE_MAX_ENTRIES) {
    const oldestKey = toolsInventoryCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    toolsInventoryCache.delete(oldestKey);
  }
}

function buildToolsInventoryCacheKey(params: ResolveEffectiveToolInventoryParams): string {
  return [
    normalizeCacheKeyPart(params.agentId),
    normalizeCacheKeyPart(params.sessionKey),
    normalizeCacheKeyPart(params.workspaceDir),
    normalizeCacheKeyPart(params.agentDir),
    normalizeCacheKeyPart(params.messageProvider),
    normalizeCacheKeyPart(params.senderIsOwner),
    normalizeCacheKeyPart(params.senderId),
    normalizeCacheKeyPart(params.senderName),
    normalizeCacheKeyPart(params.senderUsername),
    normalizeCacheKeyPart(params.senderE164),
    normalizeCacheKeyPart(params.accountId),
    normalizeCacheKeyPart(params.modelProvider),
    normalizeCacheKeyPart(params.modelId),
    normalizeCacheKeyPart(params.currentChannelId),
    normalizeCacheKeyPart(params.currentThreadTs),
    // VK long-poll keyboards emit a fresh message id on every tap. Keying the
    // inventory cache by the exact id defeats browsing reuse even though the
    // available tool set is the same while the user stays in the same thread.
    normalizeMessageContextCacheKeyPart(params.currentMessageId),
    normalizeCacheKeyPart(params.groupId),
    normalizeCacheKeyPart(params.groupChannel),
    normalizeCacheKeyPart(params.groupSpace),
    normalizeCacheKeyPart(params.replyToMode),
  ].join("\u001f");
}

function resolveCachedToolsInventory(
  params: ResolveEffectiveToolInventoryParams,
): EffectiveToolInventoryResult {
  const now = Date.now();
  pruneToolsInventoryCache(now);
  const cacheKey = buildToolsInventoryCacheKey(params);
  const cached = toolsInventoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const result = resolveEffectiveToolInventory(params);
  toolsInventoryCache.set(cacheKey, {
    expiresAt: now + TOOLS_INVENTORY_CACHE_TTL_MS,
    result,
  });
  pruneToolsInventoryCache(now);
  return result;
}

function peekCachedToolsInventory(
  params: ResolveEffectiveToolInventoryParams,
): EffectiveToolInventoryResult | null {
  const now = Date.now();
  pruneToolsInventoryCache(now);
  const cached = toolsInventoryCache.get(buildToolsInventoryCacheKey(params));
  return cached && cached.expiresAt > now ? cached.result : null;
}

function resolveToolsInventoryParams(
  params: Parameters<CommandHandler>[0],
): ResolveEffectiveToolInventoryParams {
  const effectiveAccountId = resolveChannelAccountId({
    cfg: params.cfg,
    ctx: params.ctx,
    command: params.command,
  });
  const agentId =
    params.agentId ?? resolveSessionAgentId({ sessionKey: params.sessionKey, config: params.cfg });
  const threadingContext = buildThreadingToolContext({
    sessionCtx: params.ctx,
    config: params.cfg,
    hasRepliedRef: undefined,
  });

  return {
    cfg: params.cfg,
    agentId,
    sessionKey: params.sessionKey,
    workspaceDir: params.workspaceDir,
    agentDir: params.agentDir,
    modelProvider: params.provider,
    modelId: params.model,
    messageProvider: params.command.channel,
    senderIsOwner: params.command.senderIsOwner,
    senderId: params.command.senderId,
    senderName: params.ctx.SenderName,
    senderUsername: params.ctx.SenderUsername,
    senderE164: params.ctx.SenderE164,
    accountId: effectiveAccountId,
    currentChannelId: threadingContext.currentChannelId,
    currentThreadTs:
      typeof params.ctx.MessageThreadId === "string" ||
      typeof params.ctx.MessageThreadId === "number"
        ? String(params.ctx.MessageThreadId)
        : undefined,
    currentMessageId: threadingContext.currentMessageId,
    groupId: params.sessionEntry?.groupId ?? extractExplicitGroupId(params.ctx.From),
    groupChannel:
      params.sessionEntry?.groupChannel ?? params.ctx.GroupChannel ?? params.ctx.GroupSubject,
    groupSpace: params.sessionEntry?.space ?? params.ctx.GroupSpace,
    replyToMode: resolveReplyToMode(
      params.cfg,
      params.ctx.OriginatingChannel ?? params.ctx.Provider,
      effectiveAccountId,
      params.ctx.ChatType,
    ),
  };
}

function scheduleToolsInventoryWarmup(params: ResolveEffectiveToolInventoryParams): void {
  setTimeout(() => {
    try {
      resolveCachedToolsInventory(params);
    } catch {
      // Ignore warm-up failures; the actual /tools command will surface a user-facing error.
    }
  }, 0);
}

function warmToolsInventoryInBackground(params: Parameters<CommandHandler>[0]): void {
  scheduleToolsInventoryWarmup(resolveToolsInventoryParams(params));
}

export function maybeWarmInteractiveToolsInventory(
  params: Parameters<CommandHandler>[0],
  allowTextCommands: boolean,
): void {
  if (!allowTextCommands || !params.command.isAuthorizedSender) {
    return;
  }
  const normalized = params.command.commandBodyNormalized.trim();
  if (normalized === "/tools" || normalized.startsWith("/tools ")) {
    return;
  }
  const surface = params.ctx.Surface;
  const commandPlugin = surface ? (getChannelPlugin(surface) ?? undefined) : undefined;
  if (!hasInteractiveToolsSupport(commandPlugin)) {
    return;
  }
  warmToolsInventoryInBackground(params);
}

function parseCommandsPageArg(
  commandBodyNormalized: string,
): { matched: false } | { matched: true; page: number } | { matched: true; error: string } {
  const normalized = commandBodyNormalized.trim();
  if (normalized === "/commands") {
    return { matched: true, page: 1 };
  }
  if (!normalized.startsWith("/commands ")) {
    return { matched: false };
  }

  const rawArg = normalized
    .replace(/^\/commands\b/i, "")
    .trim()
    .toLowerCase();
  if (!rawArg) {
    return { matched: true, page: 1 };
  }
  const pageToken = rawArg.startsWith("page=") ? rawArg.slice("page=".length) : rawArg;
  if (/^[0-9]+$/.test(pageToken)) {
    const page = Number.parseInt(pageToken, 10);
    if (Number.isFinite(page) && page > 0) {
      return { matched: true, page };
    }
  }
  return { matched: true, error: "Usage: /commands [page|page=<n>]" };
}

function parsePositivePage(value: string): number | null {
  if (!/^[0-9]+$/u.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseInteractiveToolsTarget(
  commandBodyNormalized: string,
): InteractiveToolsBrowseTarget | null {
  const trimmed = commandBodyNormalized.trim();
  if (!trimmed.startsWith("/tools")) {
    return null;
  }
  const argText = trimmed.replace(/^\/tools\b/i, "").trim();
  if (!argText || argText === "compact" || argText === "verbose") {
    return { kind: "groups", page: 1 };
  }

  const tokens = argText.split(/\s+/g).filter(Boolean);
  const [firstToken, secondToken, thirdToken] = tokens;
  if (!firstToken || thirdToken) {
    return null;
  }

  const rootPage = parsePositivePage(firstToken);
  if (rootPage) {
    return { kind: "groups", page: rootPage };
  }

  if (!secondToken || secondToken === "compact" || secondToken === "verbose") {
    return { kind: "group", groupId: firstToken.toLowerCase(), page: 1 };
  }

  const groupPage = parsePositivePage(secondToken);
  if (groupPage) {
    return { kind: "group", groupId: firstToken.toLowerCase(), page: groupPage };
  }

  return {
    kind: "tool",
    groupId: firstToken.toLowerCase(),
    toolId: secondToken,
  };
}

function buildInteractiveToolsGroups(
  result: EffectiveToolInventoryResult,
): InteractiveToolsGroup[] {
  return result.groups
    .map((group) => ({
      id: group.id,
      label: group.label,
      tools: group.tools.map((tool) => ({
        id: tool.id,
        label: tool.label,
        description: tool.description,
        rawDescription: tool.rawDescription,
        pluginId: tool.pluginId,
        channelId: tool.channelId,
      })),
    }))
    .filter((group) => group.tools.length > 0);
}

function buildInteractiveToolsReply(params: {
  result: EffectiveToolInventoryResult;
  commandBodyNormalized: string;
  commandPlugin: NonNullable<ReturnType<typeof getChannelPlugin>>;
}): ReplyPayload | null {
  const target = parseInteractiveToolsTarget(params.commandBodyNormalized);
  if (!target) {
    return null;
  }

  const groups = buildInteractiveToolsGroups(params.result);
  if (groups.length === 0) {
    return null;
  }

  if (target.kind === "groups") {
    const totalPages = Math.max(1, Math.ceil(groups.length / TOOLS_GROUPS_PER_PAGE));
    const currentPage = Math.max(1, Math.min(target.page, totalPages));
    const startIndex = (currentPage - 1) * TOOLS_GROUPS_PER_PAGE;
    const channelData = params.commandPlugin.commands?.buildToolsGroupListChannelData?.({
      groups: groups.slice(startIndex, startIndex + TOOLS_GROUPS_PER_PAGE).map((group) => ({
        id: group.id,
        label: group.label,
        count: group.tools.length,
      })),
      currentPage,
      totalPages,
    });
    if (!channelData) {
      return null;
    }
    return {
      text: `Available tools\n\nProfile: ${params.result.profile}\nChoose a tool group:`,
      channelData,
    };
  }

  const group = groups.find((entry) => entry.id === target.groupId);
  if (!group) {
    return null;
  }

  if (target.kind === "group") {
    const totalPages = Math.max(1, Math.ceil(group.tools.length / TOOLS_PER_PAGE));
    const currentPage = Math.max(1, Math.min(target.page, totalPages));
    const startIndex = (currentPage - 1) * TOOLS_PER_PAGE;
    const pageTools = group.tools.slice(startIndex, startIndex + TOOLS_PER_PAGE);
    const channelData = params.commandPlugin.commands?.buildToolsListChannelData?.({
      groupId: group.id,
      groupLabel: group.label,
      tools: pageTools.map((tool) => ({
        id: tool.id,
        label: tool.label,
      })),
      currentPage,
      totalPages,
    });
    if (!channelData) {
      return null;
    }
    const header =
      totalPages > 1
        ? `${group.label} — ${group.tools.length} available (page ${currentPage}/${totalPages})`
        : `${group.label} — ${group.tools.length} available`;
    return {
      text: `${header}\nTap a tool for details.`,
      channelData,
    };
  }

  const toolIndex = group.tools.findIndex(
    (tool) => tool.id.toLowerCase() === target.toolId.toLowerCase(),
  );
  if (toolIndex < 0) {
    return null;
  }
  const tool = group.tools[toolIndex];
  const currentPage = Math.max(1, Math.floor(toolIndex / TOOLS_PER_PAGE) + 1);
  const channelData = params.commandPlugin.commands?.buildToolDetailsChannelData?.({
    groupId: group.id,
    currentPage,
  });
  if (!channelData) {
    return null;
  }
  return {
    text: `${tool.label}\n\n${group.label}\n${tool.rawDescription || tool.description}`,
    channelData,
  };
}

function buildInteractiveToolsPlaceholderReply(
  commandPlugin: NonNullable<ReturnType<typeof getChannelPlugin>>,
): ReplyPayload | null {
  const channelData = commandPlugin.commands?.buildToolsGroupListChannelData?.({
    groups: [...PLACEHOLDER_INTERACTIVE_TOOLS_GROUPS],
    currentPage: 1,
    totalPages: 1,
  });
  if (!channelData) {
    return null;
  }
  return {
    text: "Available tools\n\nLoading current availability...\nChoose a tool group:",
    channelData,
  };
}

export const handleHelpCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  if (params.command.commandBodyNormalized !== "/help") {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /help from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  return {
    shouldContinue: false,
    reply: { text: buildHelpMessage(params.cfg) },
  };
};

export const handleCommandsListCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsedPage = parseCommandsPageArg(params.command.commandBodyNormalized);
  if (!parsedPage.matched) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /commands from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  if ("error" in parsedPage) {
    return {
      shouldContinue: false,
      reply: { text: parsedPage.error },
    };
  }
  const skillCommands =
    params.skillCommands ??
    listSkillCommandsForAgents({
      cfg: params.cfg,
      agentIds: params.agentId ? [params.agentId] : undefined,
    });
  const surface = params.ctx.Surface;
  const commandPlugin = surface ? (getChannelPlugin(surface) ?? undefined) : undefined;
  const paginated = buildCommandsMessagePaginated(params.cfg, skillCommands, {
    page: parsedPage.page,
    surface,
  });
  const channelData = commandPlugin?.commands?.buildCommandsListChannelData?.({
    currentPage: paginated.currentPage,
    totalPages: paginated.totalPages,
    agentId: params.agentId,
  });
  if (channelData) {
    return {
      shouldContinue: false,
      reply: {
        text: paginated.text,
        channelData,
      },
    };
  }

  if (parsedPage.page === 1 && hasInteractiveToolsSupport(commandPlugin)) {
    warmToolsInventoryInBackground(params);
  }

  return {
    shouldContinue: false,
    reply: { text: buildCommandsMessage(params.cfg, skillCommands, { surface }) },
  };
};

export const handleToolsCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  const surface = params.ctx.Surface;
  const commandPlugin = surface ? (getChannelPlugin(surface) ?? undefined) : undefined;
  const interactiveTarget = hasInteractiveToolsSupport(commandPlugin)
    ? parseInteractiveToolsTarget(normalized)
    : null;
  let verbose = false;
  if (interactiveTarget) {
    verbose = false;
  } else if (normalized === "/tools" || normalized === "/tools compact") {
    verbose = false;
  } else if (normalized === "/tools verbose") {
    verbose = true;
  } else if (normalized.startsWith("/tools ")) {
    return { shouldContinue: false, reply: { text: "Usage: /tools [compact|verbose]" } };
  } else {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /tools from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  try {
    const inventoryParams = resolveToolsInventoryParams(params);
    if (interactiveTarget?.kind === "groups" && commandPlugin) {
      const cached = peekCachedToolsInventory(inventoryParams);
      if (!cached) {
        const placeholderReply = buildInteractiveToolsPlaceholderReply(commandPlugin);
        if (placeholderReply) {
          scheduleToolsInventoryWarmup(inventoryParams);
          return {
            shouldContinue: false,
            reply: placeholderReply,
          };
        }
      }
    }
    const result = resolveCachedToolsInventory(inventoryParams);
    const interactiveReply = commandPlugin
      ? buildInteractiveToolsReply({
          result,
          commandBodyNormalized: normalized,
          commandPlugin,
        })
      : null;
    if (interactiveReply) {
      return {
        shouldContinue: false,
        reply: interactiveReply,
      };
    }
    return {
      shouldContinue: false,
      reply: { text: buildToolsMessage(result, { verbose }) },
    };
  } catch (err) {
    const message = String(err);
    const text = message.includes("missing scope:")
      ? "You do not have permission to view available tools."
      : "Couldn't load available tools right now. Try again in a moment.";
    return {
      shouldContinue: false,
      reply: { text },
    };
  }
};

export const handleStatusCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const statusRequested =
    params.directives.hasStatusDirective || params.command.commandBodyNormalized === "/status";
  if (!statusRequested) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /status from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  const reply = await buildStatusReply({
    cfg: params.cfg,
    command: params.command,
    sessionEntry: params.sessionEntry,
    sessionKey: params.sessionKey,
    parentSessionKey: params.ctx.ParentSessionKey,
    sessionScope: params.sessionScope,
    provider: params.provider,
    model: params.model,
    contextTokens: params.contextTokens,
    resolvedThinkLevel: params.resolvedThinkLevel,
    resolvedVerboseLevel: params.resolvedVerboseLevel,
    resolvedReasoningLevel: params.resolvedReasoningLevel,
    resolvedElevatedLevel: params.resolvedElevatedLevel,
    resolveDefaultThinkingLevel: params.resolveDefaultThinkingLevel,
    isGroup: params.isGroup,
    defaultGroupActivation: params.defaultGroupActivation,
    mediaDecisions: params.ctx.MediaUnderstandingDecisions,
  });
  return { shouldContinue: false, reply };
};

export const handleExportSessionCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const normalized = params.command.commandBodyNormalized;
  if (
    normalized !== "/export-session" &&
    !normalized.startsWith("/export-session ") &&
    normalized !== "/export" &&
    !normalized.startsWith("/export ")
  ) {
    return null;
  }
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /export-session from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }
  return { shouldContinue: false, reply: await buildExportSessionReply(params) };
};
