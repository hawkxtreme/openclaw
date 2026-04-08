import type { VkInboundMessage } from "./vk-core/types/longpoll.js";

export function normalizeVkReplyToId(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = String(value).trim();
  return /^\d+$/u.test(normalized) ? normalized : undefined;
}

export function resolveVkInboundReplyToId(
  message: Pick<VkInboundMessage, "conversationMessageId" | "messageId" | "isGroupChat">,
): string | undefined {
  if (message.isGroupChat) {
    return undefined;
  }

  const conversationMessageId = normalizeVkReplyToId(message.conversationMessageId);
  if (conversationMessageId) {
    return conversationMessageId;
  }

  return normalizeVkReplyToId(message.messageId);
}
