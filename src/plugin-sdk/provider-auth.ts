// Public auth/onboarding helpers for provider plugins.

import { listProfilesForProvider } from "../agents/auth-profiles/profiles.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
import { resolveEnvApiKey } from "../agents/model-auth-env.js";

export type { OpenClawConfig } from "../config/config.js";
export type { SecretInput } from "../config/types.secrets.js";
export type { ProviderAuthResult } from "../plugins/types.js";
export type { ProviderAuthContext } from "../plugins/types.js";
export type { AuthProfileStore, OAuthCredential } from "../agents/auth-profiles/types.js";

export { CODEX_CLI_PROFILE_ID } from "../agents/auth-profiles/constants.js";
export { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
export {
  listProfilesForProvider,
  upsertAuthProfile,
  upsertAuthProfileWithLock,
} from "../agents/auth-profiles/profiles.js";
export { resolveEnvApiKey } from "../agents/model-auth-env.js";
export { suggestOAuthProfileIdForLegacyDefault } from "../agents/auth-profiles/repair.js";
export {
  MINIMAX_OAUTH_MARKER,
  isNonSecretApiKeyMarker,
  resolveOAuthApiKeyMarker,
  resolveNonEnvSecretRefApiKeyMarker,
} from "../agents/model-auth-markers.js";
export {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "../plugins/provider-auth-input.js";
export {
  ensureApiKeyFromOptionEnvOrPrompt,
  normalizeSecretInputModeInput,
  promptSecretRefForSetup,
  resolveSecretInputModeForEnvSelection,
} from "../plugins/provider-auth-input.js";
export {
  buildTokenProfileId,
  validateAnthropicSetupToken,
} from "../plugins/provider-auth-token.js";
export { applyAuthProfileConfig, buildApiKeyCredential } from "../plugins/provider-auth-helpers.js";
export { createProviderApiKeyAuthMethod } from "../plugins/provider-api-key-auth.js";
export { coerceSecretRef } from "../config/types.secrets.js";
export { resolveDefaultSecretProviderAlias } from "../secrets/ref-contract.js";
export { resolveRequiredHomeDir } from "../infra/home-dir.js";
export {
  normalizeOptionalSecretInput,
  normalizeSecretInput,
} from "../utils/normalize-secret-input.js";
export {
  listKnownProviderAuthEnvVarNames,
  omitEnvKeysCaseInsensitive,
} from "../secrets/provider-env-vars.js";
export { buildOauthProviderAuthResult } from "./provider-auth-result.js";
export { generatePkceVerifierChallenge, toFormUrlEncoded } from "./oauth-utils.js";

export function isProviderApiKeyConfigured(params: {
  provider: string;
  agentDir?: string;
}): boolean {
  const traceEnabled = process.env.OPENCLAW_DEBUG_INGRESS_TIMING === "1";
  const startedAt = traceEnabled ? Date.now() : 0;
  if (resolveEnvApiKey(params.provider)?.apiKey) {
    if (traceEnabled) {
      console.warn(
        `[provider-auth] provider=${params.provider} return-env-api-key elapsedMs=${Date.now() - startedAt}`,
      );
    }
    return true;
  }
  const agentDir = params.agentDir?.trim();
  if (!agentDir) {
    if (traceEnabled) {
      console.warn(
        `[provider-auth] provider=${params.provider} return-no-agent-dir elapsedMs=${Date.now() - startedAt}`,
      );
    }
    return false;
  }
  const store = ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
  const configured = listProfilesForProvider(store, params.provider).length > 0;
  if (traceEnabled) {
    console.warn(
      `[provider-auth] provider=${params.provider} return-store configured=${configured ? "yes" : "no"} elapsedMs=${Date.now() - startedAt}`,
    );
  }
  return configured;
}
