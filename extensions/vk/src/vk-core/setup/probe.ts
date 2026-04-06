import { getVkGroupsById } from "../core/api.js";
import type { ResolvedVkAccount, VkProbeResult } from "../types/config.js";

export async function probeVkAccount(params: {
  account: ResolvedVkAccount;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<VkProbeResult> {
  const timeoutMs = params.timeoutMs ?? 2500;
  if (!params.account.token) {
    return {
      ok: false,
      accountId: params.account.accountId,
      tokenSource: params.account.tokenSource,
      error: params.account.tokenError ?? "VK token is not configured",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const groups = await getVkGroupsById({
      token: params.account.token,
      groupId: params.account.config.groupId,
      apiVersion: params.account.config.apiVersion,
      signal: controller.signal,
      fetchImpl: params.fetchImpl,
    });
    const group = groups[0];

    if (!group) {
      return {
        ok: false,
        accountId: params.account.accountId,
        tokenSource: params.account.tokenSource,
        error: "VK token did not resolve a group",
      };
    }

    if (
      params.account.config.groupId !== undefined &&
      group.id !== params.account.config.groupId
    ) {
      return {
        ok: false,
        accountId: params.account.accountId,
        tokenSource: params.account.tokenSource,
        error: `Configured groupId ${String(params.account.config.groupId)} does not match probed group ${String(group.id)}`,
      };
    }

    return {
      ok: true,
      accountId: params.account.accountId,
      tokenSource: params.account.tokenSource,
      group,
    };
  } catch (error) {
    const isAbort =
      controller.signal.aborted ||
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError");

    return {
      ok: false,
      accountId: params.account.accountId,
      tokenSource: params.account.tokenSource,
      error: isAbort
        ? `VK probe timed out after ${String(timeoutMs)}ms`
        : error instanceof Error
          ? error.message
          : String(error),
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
