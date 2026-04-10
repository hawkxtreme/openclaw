# VK Long Poll Research

Last refreshed: 2026-04-10

## Source Set

- Official overview: `https://dev.vk.com/ru/api/bots-long-poll/getting-started`
- Event toggles: `https://dev.vk.com/ru/method/groups.setLongPollSettings`
- Outbound delivery: `https://dev.vk.com/ru/method/messages.send`

## Official Contract We Should Treat As Stable

### Session bootstrap

The official flow starts by calling `groups.getLongPollServer` to obtain:

- `server`
- `key`
- `ts`

The poll request format is:

```text
{server}?act=a_check&key={key}&ts={ts}&wait=25
```

VK explicitly recommends `wait=25` because some proxies terminate connections
after 30 seconds. The documented maximum is `90`.

### Failure recovery

The Long Poll server can return:

- `failed: 1`: history is outdated or partially lost; continue with the new
  `ts` from the response.
- `failed: 2`: the key expired; refresh with `groups.getLongPollServer`.
- `failed: 3`: session state is lost; refresh both `key` and `ts` with
  `groups.getLongPollServer`.

VK also documents that error objects may contain extra fields and clients must
ignore unknown fields.

### Event configuration

Bots Long Poll event delivery is enabled through
`groups.setLongPollSettings`. For OpenClaw, the minimum useful event set is:

- `enabled=1`
- `message_new=1`
- `message_allow=1`
- `message_deny=1`
- `message_event=1`

Optional but useful toggles:

- `message_reply=1` for operational diagnostics
- `message_edit=1` only if we intentionally want to react to edited inbound
  messages later

The official overview states that the event schema is the same family as
Callback API community events. This is the key reason we can reuse most of the
normalization logic and should keep callback-specific code behind a narrow seam.

### Outbound delivery constraints

The `messages.send` documentation confirms:

- community tokens may call the method when they have `messages` scope
- `peer_id` is the canonical target field for users, chats, and communities
- `random_id` is required and is used for dedupe within the target dialog for
  the last hour, up to the most recent 100 messages

Error codes especially relevant to OpenClaw:

- `901`: cannot send to users without permission
- `902`: privacy settings block delivery
- `911`: keyboard format is invalid
- `912`: chat-bot feature must be enabled in settings
- `914`: message is too long
- `917`: no access to the chat
- `943`: cannot use this intent
- `944`: limits overflow for this intent
- `950`: reply timed out
- `1012`: writing is disabled for this chat

## Product Decisions From The Official API

### Decision 1: Long Poll must be the default transport

Long Poll is the only mode that:

- does not require public ingress
- does not require a tunnel
- does not force users to understand callback URLs, secrets, or confirmation
  codes

For ordinary users, this is the only path that can plausibly feel like
"install once, then it works."

### Decision 2: Callback stays, but only as advanced mode

Callback is still worth keeping for future work because it can remain the
cleanest home for advanced webhook-style integrations and richer server-side
deployments. It is not the right primary user journey.

### Decision 3: Long Poll keyboards should be text keyboards, not message-bound inline UX

For Long Poll, the official API path is standard message keyboards attached to
the input surface. This is closer to the Telegram mental model than
message-attached callback menus.

Operational implication:

- top-level menu launcher should be a persistent text keyboard with
  `one_time=false`
- menu navigation keyboards should avoid trapping users in dead ends
- close actions should collapse to a launcher, not strand the user with no
  discoverable re-entry path

### Decision 4: We should explicitly support `message_event` on Long Poll

Because VK exposes `message_event` as a Long Poll event toggle, it is valid to
support interactive event answers in Long Poll mode as well. This narrows the
practical gap between Callback and Long Poll more than the market often assumes.

## Operational Best Practices

### Poll loop

- Keep a single account-scoped poll loop.
- Reuse `server` and `key` until the server tells us not to.
- Use deterministic dedupe keys per event to avoid duplicate command execution.
- Record actionable counters such as `receivedEvents`, `deliveredEvents`, and
  `dedupedEvents`.

### Probe and readiness

The channel probe should tell the operator:

- whether the token is valid
- whether the configured `groupId` is reachable
- whether Long Poll is enabled
- which required event toggles are missing

This is more useful than merely reporting that a token exists.

### Delivery safety

- Always keep keyboard generation deterministic.
- Keep `random_id` collision-safe.
- Surface VK error codes in channel status and logs without burying them in
  generic failures.

### Product safety

- Never require tunnels in the primary setup flow.
- Never require typed slash commands as the only command discovery mechanism.
- Never make Callback API configuration appear required for ordinary setups.

## Immediate Implications For Our Plugin

1. Setup copy, status, and metadata must speak Long Poll first.
2. Command discovery must work through visible buttons without assuming the user
   knows slash commands.
3. Close and cancel flows must always leave a visible launcher behind.
4. The plugin should validate or at least clearly explain the required Long Poll
   event toggles.
5. Final verification must include both normal runtime and Docker runtime with
   Long Poll only.
