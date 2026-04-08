import { createChannelPairingController } from "openclaw/plugin-sdk/channel-pairing";
import { dispatchInboundDirectDmWithRuntime } from "openclaw/plugin-sdk/channel-inbound";
import { createTypingCallbacks } from "openclaw/plugin-sdk/channel-reply-pipeline";
import { resolveInboundDirectDmAccessWithRuntime } from "openclaw/plugin-sdk/direct-dm";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/core";
import type { ResolvedVkAccount } from "./accounts.js";
import { vkOutboundAdapter } from "./outbound.js";
import { resolveVkInboundReplyToId } from "./reply-to.js";
import { getVkRuntime } from "./runtime.js";
import { resolveVkInboundBody } from "./text-format.js";
import { sendVkText, sendVkTyping } from "./vk-core/outbound/send.js";
import type { VkAccessController } from "./vk-core/types/access.js";
import type { VkInboundMessage } from "./vk-core/types/longpoll.js";
import type { OpenClawConfig } from "./types.js";

const CHANNEL_ID = "vk" as const;

type VkInboundLog = {
  debug?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type VkInboundStatusSink = (
  patch: Partial<
    Pick<
      ChannelAccountSnapshot,
      "lastInboundAt" | "lastOutboundAt" | "lastEventAt" | "lastMessageAt" | "lastError"
    >
  >,
) => void;

function normalizeVkAllowEntry(entry: string): string | "*" | null {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "*") {
    return "*";
  }

  const normalized = trimmed.replace(/^vk:(?:user:)?/i, "");
  return /^\d+$/u.test(normalized) ? normalized : null;
}

function isVkSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  for (const entry of allowFrom) {
    const normalized = normalizeVkAllowEntry(entry);
    if (!normalized) {
      continue;
    }
    if (normalized === "*" || normalized === senderId) {
      return true;
    }
  }
  return false;
}

function resolveVkGroupConfig(account: ResolvedVkAccount, peerId: number) {
  const wildcard = account.config.groups?.["*"];
  const specific = account.config.groups?.[String(peerId)];

  if (!wildcard && !specific) {
    return undefined;
  }

  return {
    ...wildcard,
    ...specific,
  };
}

function buildVkConversationLabel(message: VkInboundMessage): string {
  return message.isGroupChat ? `VK chat ${String(message.peerId)}` : `VK user ${String(message.senderId)}`;
}

function resolveVkGroupCommandAuthorization(params: {
  cfg: OpenClawConfig;
  account: ResolvedVkAccount;
  senderId: string;
  rawBody: string;
  groupAllowFrom: string[];
  runtime: ReturnType<typeof getVkRuntime>;
}): boolean | undefined {
  const shouldComputeAuth = params.runtime.channel.commands.shouldComputeCommandAuthorized(
    params.rawBody,
    params.cfg,
  );
  if (!shouldComputeAuth) {
    return undefined;
  }

  const ownerAllowFrom = params.account.config.allowFrom ?? [];
  if (ownerAllowFrom.length === 0 && params.groupAllowFrom.length === 0) {
    return true;
  }
  return params.runtime.channel.commands.resolveCommandAuthorizedFromAuthorizers({
    useAccessGroups: params.cfg.commands?.useAccessGroups !== false,
    authorizers: [
      {
        configured: ownerAllowFrom.length > 0,
        allowed: isVkSenderAllowed(params.senderId, ownerAllowFrom),
      },
      {
        configured: params.groupAllowFrom.length > 0,
        allowed: isVkSenderAllowed(params.senderId, params.groupAllowFrom),
      },
    ],
  });
}

async function deliverVkReply(params: {
  cfg: OpenClawConfig;
  accountId: string;
  to: string;
  replyToId?: string;
  payload: unknown;
  statusSink?: VkInboundStatusSink;
}) {
  if (!vkOutboundAdapter.sendPayload) {
    throw new Error("VK outbound adapter is not available");
  }

  await vkOutboundAdapter.sendPayload({
    cfg: params.cfg,
    to: params.to,
    accountId: params.accountId,
    replyToId: params.replyToId,
    payload: params.payload as never,
    text: "",
  });

  params.statusSink?.({ lastOutboundAt: Date.now() });
}

function createVkTypingCallbacks(params: {
  account: ResolvedVkAccount;
  message: VkInboundMessage;
  log?: VkInboundLog;
}) {
  return createTypingCallbacks({
    start: async () => {
      await sendVkTyping({
        account: params.account,
        peerId: params.message.peerId,
      });
    },
    onStartError: (error) => {
      params.log?.warn?.(
        `[${params.account.accountId}] VK typing activity failed: ${String(error)}`,
      );
    },
  });
}

export async function handleVkInboundMessage(params: {
  cfg: OpenClawConfig;
  account: ResolvedVkAccount;
  message: VkInboundMessage;
  accessController?: VkAccessController;
  log?: VkInboundLog;
  statusSink?: VkInboundStatusSink;
}): Promise<void> {
  const { cfg, account, message, accessController, log, statusSink } = params;
  const ingressTimingEnabled = process.env.OPENCLAW_DEBUG_INGRESS_TIMING === "1";
  const inboundStartedAt = ingressTimingEnabled ? Date.now() : 0;
  const traceInbound = (step: string) => {
    if (!ingressTimingEnabled) {
      return;
    }
    log?.debug?.(
      `[${account.accountId}] VK inbound ${step} message=${message.messageId} elapsedMs=${Date.now() - inboundStartedAt}`,
    );
  };

  traceInbound("start");
  const rawBody = resolveVkInboundBody(message);
  if (!rawBody) {
    log?.debug?.(
      `[${account.accountId}] skipping VK message ${message.messageId} without text content`,
    );
    return;
  }

  traceInbound("body-ready");
  const core = getVkRuntime();
  const replyToId = resolveVkInboundReplyToId(message);
  statusSink?.({
    lastInboundAt: message.createdAt,
    lastEventAt: message.createdAt,
    lastMessageAt: message.createdAt,
    lastError: null,
  });
  const typingCallbacks = createVkTypingCallbacks({
    account,
    message,
    log,
  });
  traceInbound("runtime-ready");

  if (message.isGroupChat) {
    const groupAccess = accessController?.evaluateMessage({ account, message });
    if (groupAccess && groupAccess.decision !== "allow") {
      log?.debug?.(
        `[${account.accountId}] dropping VK group message ${message.messageId} (${groupAccess.reason})`,
      );
      return;
    }

    const groupConfig = resolveVkGroupConfig(account, message.peerId);
    const authorization = resolveVkGroupCommandAuthorization({
      cfg,
      account,
      senderId: String(message.senderId),
      rawBody,
      groupAllowFrom: groupConfig?.allowFrom ?? account.config.groupAllowFrom ?? [],
      runtime: core,
    });

    if (authorization === false) {
      log?.debug?.(
        `[${account.accountId}] dropping VK group control command from ${String(message.senderId)}`,
      );
      return;
    }

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: CHANNEL_ID,
      accountId: account.accountId,
      peer: {
        kind: "group",
        id: String(message.peerId),
      },
    });
    const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
      agentId: route.agentId,
    });
    const previousTimestamp = core.channel.session.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    });
    const conversationLabel = buildVkConversationLabel(message);
    const body = core.channel.reply.formatAgentEnvelope({
      channel: "VK",
      from: conversationLabel,
      timestamp: message.createdAt,
      previousTimestamp,
      envelope: core.channel.reply.resolveEnvelopeFormatOptions(cfg),
      body: rawBody,
    });
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      BodyForAgent: rawBody,
      RawBody: rawBody,
      CommandBody: rawBody,
      From: `vk:user:${String(message.senderId)}`,
      To: `vk:conversation:${String(message.peerId)}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId ?? account.accountId,
      ChatType: "group",
      ConversationLabel: conversationLabel,
      SenderId: String(message.senderId),
      GroupSubject: conversationLabel,
      GroupChannel: String(message.peerId),
      WasMentioned: groupAccess?.wasMentioned,
      Provider: CHANNEL_ID,
      Surface: CHANNEL_ID,
      MessageSid: message.messageId,
      MessageSidFull: message.messageId,
      ReplyToId: replyToId,
      Timestamp: message.createdAt,
      OriginatingChannel: CHANNEL_ID,
      OriginatingTo: `vk:${String(message.peerId)}`,
      CommandAuthorized: authorization,
    });

    await dispatchInboundReplyWithBase({
      cfg,
      channel: CHANNEL_ID,
      accountId: account.accountId,
      route,
      storePath,
      ctxPayload,
      core,
      deliver: async (payload) =>
        await deliverVkReply({
          cfg,
          accountId: account.accountId,
          to: String(message.peerId),
          replyToId,
          payload,
          statusSink,
        }),
      onRecordError: (error) => {
        const rendered = String(error);
        statusSink?.({ lastError: rendered });
        log?.warn?.(`[${account.accountId}] failed recording VK session: ${rendered}`);
      },
      onDispatchError: (error, info) => {
        const rendered = String(error);
        statusSink?.({ lastError: rendered });
        log?.error?.(`[${account.accountId}] VK ${info.kind} reply failed: ${rendered}`);
      },
      typingCallbacks,
    });
    return;
  }

  const consentState = accessController?.getConsentState({
    accountId: account.accountId,
    senderId: message.senderId,
  });
  if (consentState === "denied") {
    log?.debug?.(
      `[${account.accountId}] dropping VK DM ${message.messageId} because consent is denied`,
    );
    return;
  }

  const pairing = createChannelPairingController({
    core,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });
  traceInbound("before-dm-access");
  const dmAccess = await resolveInboundDirectDmAccessWithRuntime({
    cfg,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    dmPolicy: account.config.dmPolicy,
    allowFrom: account.config.allowFrom,
    senderId: String(message.senderId),
    rawBody,
    isSenderAllowed: isVkSenderAllowed,
    runtime: {
      shouldComputeCommandAuthorized: core.channel.commands.shouldComputeCommandAuthorized,
      resolveCommandAuthorizedFromAuthorizers:
        core.channel.commands.resolveCommandAuthorizedFromAuthorizers,
    },
    readStoreAllowFrom: pairing.readStoreForDmPolicy,
  });
  traceInbound("after-dm-access");

  if (dmAccess.access.decision === "pairing") {
    await pairing.issueChallenge({
      senderId: String(message.senderId),
      senderIdLine: `Your VK user id: ${String(message.senderId)}`,
      sendPairingReply: async (text) => {
        await sendVkText({
          account,
          peerId: message.peerId,
          text,
          replyTo: replyToId,
        });
        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onReplyError: (error) => {
        log?.warn?.(
          `[${account.accountId}] failed sending VK pairing challenge: ${String(error)}`,
        );
      },
    });
    log?.debug?.(
      `[${account.accountId}] dropping VK DM ${message.messageId} pending pairing approval`,
    );
    return;
  }

  if (dmAccess.access.decision !== "allow") {
    log?.debug?.(
      `[${account.accountId}] dropping VK DM ${message.messageId} (${dmAccess.access.reason})`,
    );
    return;
  }

  traceInbound("before-dm-dispatch");
  await dispatchInboundDirectDmWithRuntime({
    cfg,
    runtime: core,
    channel: CHANNEL_ID,
    channelLabel: "VK",
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: String(message.senderId),
    },
    senderId: String(message.senderId),
    senderAddress: `vk:user:${String(message.senderId)}`,
    recipientAddress: `vk:${String(message.peerId)}`,
    conversationLabel: buildVkConversationLabel(message),
    rawBody,
    messageId: message.messageId,
    timestamp: message.createdAt,
    commandAuthorized: dmAccess.commandAuthorized,
    deliver: async (payload) =>
        await deliverVkReply({
          cfg,
          accountId: account.accountId,
          to: String(message.peerId),
          replyToId,
          payload,
          statusSink,
        }),
    onRecordError: (error) => {
      const rendered = String(error);
      statusSink?.({ lastError: rendered });
      log?.warn?.(`[${account.accountId}] failed recording VK session: ${rendered}`);
    },
    onDispatchError: (error, info) => {
      const rendered = String(error);
      statusSink?.({ lastError: rendered });
      log?.error?.(`[${account.accountId}] VK ${info.kind} reply failed: ${rendered}`);
    },
    typingCallbacks,
  });
  traceInbound("after-dm-dispatch");
}
