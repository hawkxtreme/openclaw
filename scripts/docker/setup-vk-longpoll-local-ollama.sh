#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VK_GROUP_ID="${VK_GROUP_ID:-}"
VK_GROUP="${VK_GROUP:-}"
VK_GROUP_TOKEN="${VK_GROUP_TOKEN:-}"
VK_DM_POLICY="${OPENCLAW_VK_DM_POLICY:-pairing}"
OLLAMA_BASE_URL="${OPENCLAW_OLLAMA_BASE_URL:-http://host.docker.internal:11434}"
OLLAMA_MODEL_ID="${OPENCLAW_OLLAMA_MODEL_ID:-qwen3.5:9b}"
OLLAMA_MODEL_NAME="${OPENCLAW_OLLAMA_MODEL_NAME:-Qwen 3.5 9B}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

print_help() {
  cat <<'EOF'
Usage:
  setup-vk-longpoll-local-ollama.sh [options]

Options:
  --group-id <id>        VK community id
  --group <value>        VK community URL or club/public handle
  --token <token>        VK community token for this one-shot run
  --dm-policy <policy>   VK DM policy (default: pairing)
  --help                 Show this help
EOF
}

normalize_vk_group_id() {
  local raw="$1"

  if [[ "$raw" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s' "$raw"
    return 0
  fi

  if [[ "$raw" =~ ^(club|public)([1-9][0-9]*)$ ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
    return 0
  fi

  if [[ "$raw" =~ ^(https?://)?(m\.)?vk\.com/(club|public)([1-9][0-9]*)(/)?([?#].*)?$ ]]; then
    printf '%s' "${BASH_REMATCH[4]}"
    return 0
  fi

  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --group-id)
      [[ $# -ge 2 ]] || fail "--group-id requires a value"
      VK_GROUP_ID="$2"
      shift 2
      ;;
    --group)
      [[ $# -ge 2 ]] || fail "--group requires a value"
      VK_GROUP="$2"
      shift 2
      ;;
    --token)
      [[ $# -ge 2 ]] || fail "--token requires a value"
      VK_GROUP_TOKEN="$2"
      shift 2
      ;;
    --dm-policy)
      [[ $# -ge 2 ]] || fail "--dm-policy requires a value"
      VK_DM_POLICY="$2"
      shift 2
      ;;
    --help | -h)
      print_help
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ -n "$VK_GROUP_ID" && -n "$VK_GROUP" ]]; then
  fail "Set only one of VK_GROUP_ID or VK_GROUP"
fi

if [[ -n "$VK_GROUP" ]]; then
  VK_GROUP_ID="$(normalize_vk_group_id "$VK_GROUP")" || fail "VK_GROUP must be a positive id, club/public handle, or vk.com community URL"
fi

if [[ -z "$VK_GROUP_ID" ]]; then
  fail "VK_GROUP_ID or VK_GROUP is required"
fi

if [[ ! "$VK_GROUP_ID" =~ ^[1-9][0-9]*$ ]]; then
  fail "VK_GROUP_ID must resolve to a positive integer"
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
