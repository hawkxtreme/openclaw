# VK Extension

Bundled VK channel extension for OpenClaw.

This plugin is now designed around a Long-Poll-first setup path:

- no public tunnel
- no webhook secret in the default flow
- works for direct messages and group chats
- supports buttons, media, and pairing or allowlist policies

The active product path is Long Poll only. Callback work is kept separately on
the archive branch and is not part of the recommended setup.

## Quick Start

### 1. Prepare the VK community

In VK community settings:

1. Enable community messages.
2. Create a community access token.
3. Grant at least these scopes:
   - `messages`
   - `manage`
4. Grant these too if you want outbound media:
   - `photos`
   - `docs`
5. Enable **Bots Long Poll API**.
6. Enable these Long Poll event types:
   - `message_new`
   - `message_allow`
   - `message_deny`
   - `message_event`
7. If you want group chats, allow the community to be added to chats.

Official VK references:

- `https://dev.vk.com/ru/api/bots-long-poll/getting-started`
- `https://dev.vk.com/ru/method/groups.setLongPollSettings`
- `https://dev.vk.com/ru/method/messages.send`

### 2. Configure OpenClaw

Add VK to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "vk": {
      "enabled": true,
      "groupId": 123456789,
      "accessToken": "vk1.a...",
      "transport": "long-poll",
      "dmPolicy": "pairing"
    }
  }
}
```

Minimal useful options:

- `groupId`: the VK community id
- `accessToken` or `tokenFile`: the community token
- `transport`: leave this as `long-poll` for ordinary setups
- `dmPolicy`: `pairing`, `allowlist`, `open`, or `disabled`

Optional group-chat controls:

```json
{
  "channels": {
    "vk": {
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["123456789"],
      "groups": {
        "*": {
          "requireMention": true
        },
        "2000000123": {
          "enabled": true,
          "allowFrom": ["123456789", "987654321"],
          "requireMention": false
        }
      }
    }
  }
}
```

### 3. Start and verify

Restart the gateway:

```bash
openclaw gateway restart
```

Run a probe:

```bash
openclaw channels status --json --probe
```

Then message the VK bot. If `dmPolicy` is `pairing`, approve the first pairing
request:

```bash
openclaw pairing approve vk <CODE>
```

## What The Probe Should Catch

The Long Poll probe is expected to catch these common mistakes:

- invalid or revoked token
- wrong `groupId`
- Bots Long Poll API disabled in VK
- required Long Poll events not enabled

If outbound delivery fails later, the most common VK causes are:

- missing user permission to receive messages
- invalid keyboard payload
- disabled chat-bot settings for chats
- inaccessible or closed chat
- missing `photos` or `docs` scopes for media

## Product Scope

Current scope:

- Long Poll as the default user path
- direct messages
- group chats
- model and tool command menus
- outbound text and media
- pairing and allowlist controls

Archived scope for later:

- Callback API transport
- webhook-specific deployment workflows

## Local Development

```bash
corepack pnpm test extensions/vk/tests/unit/vk-config.test.ts
corepack pnpm test extensions/vk/tests/unit/vk-probe.test.ts
corepack pnpm test extensions/vk/tests/unit/vk-plugin-adapter.test.ts
```
