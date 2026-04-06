import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { createPairingPrefixStripper } from "openclaw/plugin-sdk/channel-pairing";
import { resolveVkAccount, type ResolvedVkAccount } from "./accounts.js";
import { vkChannelPluginCommon, vkSecurityAdapter } from "./channel-shared.js";
import { vkGatewayAdapter } from "./gateway.js";
import { resolveVkGroupRequireMention } from "./group-policy.js";
import { vkMessagingAdapter, vkOutboundAdapter } from "./outbound.js";
import { vkSetupAdapter } from "./setup-core.js";
import { sendVkText } from "./vk-core/outbound/send.js";
import type { VkProbeResult } from "./vk-core/types/config.js";
import { vkStatusAdapter } from "./status.js";

export const vkPlugin: ChannelPlugin<ResolvedVkAccount, VkProbeResult> = createChatChannelPlugin({
  base: {
    id: "vk",
    ...vkChannelPluginCommon,
    setup: vkSetupAdapter,
    status: vkStatusAdapter,
    messaging: vkMessagingAdapter,
    groups: {
      resolveRequireMention: resolveVkGroupRequireMention,
    },
    gateway: vkGatewayAdapter,
  },
  pairing: {
    text: {
      idLabel: "vkUserId",
      message: "OpenClaw: your VK access has been approved.",
      normalizeAllowEntry: createPairingPrefixStripper(/^vk:(?:user:)?/i),
      notify: async ({ cfg, id, message, accountId }) => {
        const account = resolveVkAccount({
          cfg,
          accountId,
        });
        await sendVkText({
          account,
          peerId: id,
          text: message,
        });
      },
    },
  },
  security: vkSecurityAdapter,
  outbound: vkOutboundAdapter,
});
