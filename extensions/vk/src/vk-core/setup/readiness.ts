import { parseVkConfig } from "../config/schema.js";
import { listEnabledVkAccounts } from "../config/accounts.js";

export function runVkReleaseReadinessChecks(configInput: unknown): string[] {
  const config = parseVkConfig(configInput);
  const issues: string[] = [];

  for (const account of listEnabledVkAccounts(config, {})) {
    if (!account.config.groupId) {
      issues.push(
        `channels.vk.accounts.${account.accountId}.groupId is required`,
      );
    }
    if (!account.token) {
      issues.push(
        `channels.vk.accounts.${account.accountId}.accessToken is required`,
      );
    }

    if (account.config.transport === "callback-api") {
      if (!account.config.callback.path) {
        issues.push(
          `channels.vk.callback.path is required for callback-api transport`,
        );
      }
      if (!account.config.callback.secret) {
        issues.push(
          `channels.vk.callback.secret is required for callback-api transport`,
        );
      }
      if (!account.config.callback.confirmationCode) {
        issues.push(
          `channels.vk.callback.confirmationCode is required for callback-api transport`,
        );
      }
    }
  }

  return issues;
}
