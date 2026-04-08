import { createAttachedChannelResultAdapter } from "openclaw/plugin-sdk/channel-send-result";
import { buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/core";
import { resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import {
  normalizeInteractiveReply,
  resolveInteractiveTextFallback,
} from "openclaw/plugin-sdk/interactive-runtime";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import {
  resolveDefaultVkAccountId,
  resolveVkAccount,
  type ResolvedVkAccount,
} from "./accounts.js";
import { buildVkKeyboard, resolveVkButtonsFromPayload } from "./keyboard.js";
import { normalizeVkReplyToId } from "./reply-to.js";
import { sendVkPayload } from "./vk-core/outbound/media.js";
import { normalizeVkPeerId, sendVkText } from "./vk-core/outbound/send.js";

const VK_GROUP_CHAT_PEER_ID_MIN = 2_000_000_000;

export function normalizeVkTarget(raw: string): string | undefined {
  const trimmed = raw
    .trim()
    .replace(/^vk:/i, "")
    .replace(/^(user|group|chat|conversation|dm):/i, "")
    .trim();
  return trimmed || undefined;
}

function inferVkChatType(target: string): "direct" | "group" | undefined {
  try {
    const peerId = normalizeVkPeerId(target);
    return peerId >= VK_GROUP_CHAT_PEER_ID_MIN ? "group" : "direct";
  } catch {
    return undefined;
  }
}

async function sendVkOutboundPayload(params: {
  account: ResolvedVkAccount;
  to: string;
  text?: string;
  mediaUrls?: string[];
  replyToId?: string | null;
  mediaLocalRoots?: readonly string[];
  forceDocument?: boolean;
  keyboard?: string;
}) {
  const result = await sendVkPayload({
    account: params.account,
    peerId: params.to,
    text: params.text,
    keyboard: params.keyboard,
    mediaUrls: params.mediaUrls,
    replyTo: normalizeVkReplyToId(params.replyToId),
    mediaLocalRoots: params.mediaLocalRoots,
    forceDocument: params.forceDocument,
  });

  return {
    messageId: result.messageId,
    conversationId: String(result.peerId),
    meta: {
      peerId: result.peerId,
      randomId: result.randomId,
      attachments: result.attachments,
    },
  };
}

export const vkOutboundAdapter: NonNullable<ChannelPlugin<ResolvedVkAccount>["outbound"]> = {
  deliveryMode: "direct",
  resolveTarget: ({ to }) => {
    const normalized = to ? normalizeVkTarget(to) : undefined;
    if (!normalized) {
      return {
        ok: false,
        error: new Error("VK target is required"),
      };
    }
    return {
      ok: true,
      to: normalized,
    };
  },
  sendPayload: async ({ cfg, to, payload, accountId, replyToId, mediaLocalRoots, forceDocument }) => {
    const account = resolveVkAccount({
      cfg,
      accountId,
    });
    const interactive = normalizeInteractiveReply(payload.interactive);
    const resolvedText =
      resolveInteractiveTextFallback({
        text: payload.text,
        interactive,
      }) ?? payload.text;
    const parts = resolveSendableOutboundReplyParts({
      ...payload,
      text: resolvedText,
    });
    const keyboard = buildVkKeyboard(resolveVkButtonsFromPayload(payload));

    return {
      channel: "vk",
      ...(await sendVkOutboundPayload({
        account,
        to,
        text: parts.hasText ? parts.trimmedText : undefined,
        keyboard,
        mediaUrls: parts.mediaUrls,
        replyToId: replyToId ?? null,
        mediaLocalRoots,
        forceDocument,
      })),
    };
  },
  ...createAttachedChannelResultAdapter({
    channel: "vk",
    sendText: async ({ cfg, to, text, accountId, replyToId }) => {
      const account = resolveVkAccount({
        cfg,
        accountId,
      });
      const result = await sendVkText({
        account,
        peerId: to,
        text,
        replyTo: normalizeVkReplyToId(replyToId),
      });

      return {
        messageId: result.messageId,
        conversationId: String(result.peerId),
        meta: {
          peerId: result.peerId,
          randomId: result.randomId,
        },
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId, mediaLocalRoots, forceDocument }) => {
      const account = resolveVkAccount({
        cfg,
        accountId,
      });
      return await sendVkOutboundPayload({
        account,
        to,
        text: text?.trim() || undefined,
        mediaUrls: mediaUrl ? [mediaUrl] : [],
        replyToId: replyToId ?? null,
        mediaLocalRoots,
        forceDocument,
      });
    },
  }),
};

export const vkMessagingAdapter: NonNullable<ChannelPlugin<ResolvedVkAccount>["messaging"]> = {
  normalizeTarget: normalizeVkTarget,
  inferTargetChatType: ({ to }) => inferVkChatType(to),
  targetResolver: {
    looksLikeId: (raw, normalized) => {
      const candidate = normalized?.trim() || normalizeVkTarget(raw);
      return Boolean(candidate && /^\d+$/u.test(candidate));
    },
    hint: "<peerId>",
  },
  resolveOutboundSessionRoute: ({ cfg, agentId, accountId, target, threadId }) => {
    const normalized = normalizeVkTarget(target);
    if (!normalized) {
      return null;
    }

    const chatType = inferVkChatType(normalized) ?? "direct";
    const resolvedAccountId = accountId ?? resolveDefaultVkAccountId(cfg);

    return buildChannelOutboundSessionRoute({
      cfg,
      agentId,
      channel: "vk",
      accountId: resolvedAccountId,
      peer: {
        kind: chatType,
        id: normalized,
      },
      chatType,
      from: resolvedAccountId,
      to: normalized,
      ...(threadId !== undefined && threadId !== null ? { threadId } : {}),
    });
  },
};
