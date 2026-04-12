#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VK_GROUP_ID="${VK_GROUP_ID:-}"
VK_GROUP_TOKEN="${VK_GROUP_TOKEN:-}"
VK_DM_POLICY="${OPENCLAW_VK_DM_POLICY:-pairing}"
OLLAMA_BASE_URL="${OPENCLAW_OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_MODEL_ID="${OPENCLAW_OLLAMA_MODEL_ID:-qwen3.5:9b}"
OLLAMA_MODEL_NAME="${OPENCLAW_OLLAMA_MODEL_NAME:-Qwen 3.5 9B}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ -z "$VK_GROUP_ID" ]]; then
  fail "VK_GROUP_ID is required"
fi

if [[ ! "$VK_GROUP_ID" =~ ^[1-9][0-9]*$ ]]; then
  fail "VK_GROUP_ID must be a positive integer"
fi

if [[ -z "$VK_GROUP_TOKEN" ]]; then
  fail "VK_GROUP_TOKEN is required"
fi

if [[ -n "${OPENCLAW_DOCKER_CONFIG_BATCH_JSON:-}" || -n "${OPENCLAW_DOCKER_CONFIG_BATCH_FILE:-}" ]]; then
  fail "setup-vk-longpoll-local-ollama.sh owns OPENCLAW_DOCKER_CONFIG_BATCH_JSON/FILE; unset them before running this wrapper"
fi

export OPENCLAW_DOCKER_CONFIG_BATCH_JSON="$(
  VK_GROUP_ID="$VK_GROUP_ID" \
  VK_DM_POLICY="$VK_DM_POLICY" \
  OLLAMA_BASE_URL="$OLLAMA_BASE_URL" \
  OLLAMA_MODEL_ID="$OLLAMA_MODEL_ID" \
  OLLAMA_MODEL_NAME="$OLLAMA_MODEL_NAME" \
  node <<'NODE'
const groupId = Number(process.env.VK_GROUP_ID);
const dmPolicy = process.env.VK_DM_POLICY || "pairing";
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434";
const ollamaModelId = process.env.OLLAMA_MODEL_ID || "qwen3.5:9b";
const ollamaModelName = process.env.OLLAMA_MODEL_NAME || "Qwen 3.5 9B";

const batch = [
  {
    path: "agents.defaults.model.primary",
    value: `ollama/${ollamaModelId}`,
  },
  {
    path: "agents.defaults.models",
    value: {
      [`ollama/${ollamaModelId}`]: {},
    },
  },
  {
    path: "models.providers.ollama",
    value: {
      baseUrl: ollamaBaseUrl,
      apiKey: "ollama-local",
      api: "ollama",
      models: [
        {
          id: ollamaModelId,
          name: ollamaModelName,
          reasoning: false,
          input: ["text"],
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          },
          contextWindow: 32768,
          maxTokens: 131072,
        },
      ],
    },
  },
  {
    path: "channels.vk.enabled",
    value: true,
  },
  {
    path: "channels.vk.groupId",
    value: groupId,
  },
  {
    path: "channels.vk.transport",
    value: "long-poll",
  },
  {
    path: "channels.vk.accessToken",
    value: {
      source: "env",
      provider: "default",
      id: "VK_GROUP_TOKEN",
    },
  },
  {
    path: "channels.vk.dmPolicy",
    value: dmPolicy,
  },
];

process.stdout.write(JSON.stringify(batch));
NODE
)"

exec "$SCRIPT_DIR/setup.sh"
