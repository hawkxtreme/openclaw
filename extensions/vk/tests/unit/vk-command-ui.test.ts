import { describe, expect, it } from "vitest";
import {
  buildVkModelsProviderChannelData,
  buildVkToolsGroupListChannelData,
} from "../../src/command-ui.js";

function getButtonLabels(
  channelData: NonNullable<ReturnType<typeof buildVkToolsGroupListChannelData>>,
) {
  return channelData.vk?.buttons.map((row) => row.map((button) => button.text)) ?? [];
}

describe("vk command ui", () => {
  it("keeps a back path on the tools group picker", () => {
    const channelData = buildVkToolsGroupListChannelData({
      groups: [
        { id: "builtin", label: "Built-in tools", count: 23 },
        { id: "connected", label: "Connected tools", count: 3 },
      ],
      currentPage: 1,
      totalPages: 1,
    });

    expect(channelData).not.toBeNull();
    expect(getButtonLabels(channelData!)).toEqual([
      ["Built-in (23)", "Connected (3)"],
      ["< Back", "Close"],
    ]);
  });

  it("omits zero-count suffixes on placeholder tool groups", () => {
    const channelData = buildVkToolsGroupListChannelData({
      groups: [
        { id: "builtin", label: "Built-in tools", count: 0 },
        { id: "connected", label: "Connected tools", count: 0 },
        { id: "channel", label: "Channel tools", count: 0 },
      ],
      currentPage: 1,
      totalPages: 1,
    });

    expect(channelData).not.toBeNull();
    expect(getButtonLabels(channelData!)).toEqual([
      ["Built-in", "Connected"],
      ["Channel"],
      ["< Back", "Close"],
    ]);
  });

  it("keeps a back path on the model provider picker", () => {
    const channelData = buildVkModelsProviderChannelData({
      providers: [
        { id: "openai", count: 10 },
        { id: "proxy", count: 3 },
      ],
      currentPage: 1,
      totalPages: 1,
    });

    expect(channelData).not.toBeNull();
    expect(channelData?.vk?.buttons.map((row) => row.map((button) => button.text))).toEqual([
      ["openai (10)", "proxy (3)"],
      ["< Back", "Close"],
    ]);
  });
});
