# VK Session Handoff

## Purpose

This file is the single source of truth for the next Codex session working on the VK extension.

## Canonical Workspace

- Workspace root: `D:\project\openclaw-official-vk`
- Repository type: fresh official OpenClaw clone in a separate folder
- Active branch: `feature/vk-extension-integration`
- Main implementation root: `D:\project\openclaw-official-vk\extensions\vk`

## Important Constraints

- Do not use `D:\project\openclaw`
- Do not treat `D:\project\openclaw_vk\temp\reference_repos\official_openclaw` as the main repo anymore
- Do not commit the local SDD
- Do not change the global Node version on this machine
- Keep the VK work as an extension, not as a core patch

## Local-Only Files

- Local SDD, never commit:
  - `D:\project\openclaw_vk\temp\local_docs\openclaw-vk-sdd.md`
- Local backup snapshot:
  - `D:\project\openclaw_vk\temp\backups\official_openclaw_vk_2026-04-06`
- Local backup archive:
  - `D:\project\openclaw_vk\temp\backups\official_openclaw_vk_2026-04-06.zip`

## Skills And MCP

- Global Codex skills are already installed on this machine:
  - `C:\Users\user\.codex\skills`
- Local MCP config is ready in this repo:
  - `D:\project\openclaw-official-vk\.mcp.json`
  - `D:\project\openclaw-official-vk\.mcp.example.json`
- Both `docs/local/` and `.mcp.json` are excluded locally and should not be committed

## What Was Completed Before Migration

The original local project `D:\project\openclaw_vk` was used for:

- OpenClaw research and SDD preparation
- unofficial GitHub scan for VK-related implementations
- third-party comparison against our SDD
- skills, MCP and environment analysis
- local workspace bootstrap and test/security process design
- implementation of the VK channel feature set in a standalone workspace

## What Was Implemented In VK

### Core VK capability set

- config parsing and account resolution
- token handling and per-account merge logic
- probe and readiness checks
- long poll monitor
- outbound text sending
- pairing and allowlist access control
- media upload and attachment sending
- group support with policy gates
- callback API ingress
- interactive event handling
- observability helpers and eval fixtures
- release and hardening notes

### Official OpenClaw extension integration

The work was migrated into a real extension layout under:

- `D:\project\openclaw-official-vk\extensions\vk`

Key extension entry points:

- `D:\project\openclaw-official-vk\extensions\vk\openclaw.plugin.json`
- `D:\project\openclaw-official-vk\extensions\vk\package.json`
- `D:\project\openclaw-official-vk\extensions\vk\index.ts`
- `D:\project\openclaw-official-vk\extensions\vk\setup-entry.ts`
- `D:\project\openclaw-official-vk\extensions\vk\api.ts`
- `D:\project\openclaw-official-vk\extensions\vk\runtime-api.ts`

Important adapter and runtime files:

- `D:\project\openclaw-official-vk\extensions\vk\src\channel.ts`
- `D:\project\openclaw-official-vk\extensions\vk\src\gateway.ts`
- `D:\project\openclaw-official-vk\extensions\vk\src\inbound.ts`
- `D:\project\openclaw-official-vk\extensions\vk\src\outbound.ts`
- `D:\project\openclaw-official-vk\extensions\vk\src\setup-core.ts`
- `D:\project\openclaw-official-vk\extensions\vk\src\status.ts`
- `D:\project\openclaw-official-vk\extensions\vk\src\vk-core\**`

## Verification Already Completed

These checks already passed in `D:\project\openclaw-official-vk`:

- `corepack pnpm install`
- VK subset tests: `46/46` passed
- filtered TypeScript check: `NO_VK_TSC_ERRORS`

Exact VK test command pattern used:

```powershell
$includeFile = 'D:\project\openclaw-official-vk\temp_vk_include_run.json'
Set-Content -LiteralPath $includeFile -Value '["vk/tests/unit/**/*.test.ts","vk/tests/integration/**/*.test.ts","vk/tests/e2e/**/*.test.ts"]'
$env:OPENCLAW_VITEST_INCLUDE_FILE = $includeFile
corepack pnpm vitest run --config vitest.extensions.config.ts
Remove-Item Env:OPENCLAW_VITEST_INCLUDE_FILE -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $includeFile -Force -ErrorAction SilentlyContinue
```

Filtered TypeScript check used:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=8192'
$output = corepack pnpm exec tsc -p tsconfig.json --noEmit 2>&1
$output | Select-String 'extensions\\vk'
```

Expected result for the second command: no lines related to `extensions\vk`

## Current Git State

Current status in the new repo should be conceptually:

- `M pnpm-lock.yaml`
- `?? extensions/vk/`

This is expected because the extension and lockfile have not been committed yet.

## Known Caveats

- The full upstream repository may still have unrelated TypeScript issues outside `extensions/vk`
- The local extension is clean, but do not claim the whole upstream repo is type-clean
- Importing `openclaw/plugin-sdk/command-auth` was observed to hang in the reference integration flow
- Because of that, group command authorization in `extensions/vk/src/inbound.ts` uses local helper logic instead of that import
- `extensions/vk/node_modules/.bin/*` may appear in the workspace because of pnpm linking; focus on tracked source files and ignore local package-manager artifacts

## What Was Copied Into This Repo For Context

The following non-secret context from the original local workspace was copied here:

- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\analysis\*`
- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\architecture\*`
- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\planning\*`
- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\research\*`
- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\superpowers\plans\*`
- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\security\*`
- `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\README.md`

These copies exist only to help future sessions. The original source workspace still exists at:

- `D:\project\openclaw_vk`

## Read These Files Next

If more context is needed, read these in order:

1. `D:\project\openclaw-official-vk\extensions\vk\README.md`
2. `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\planning\recommended-solution.md`
3. `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\research\skills-mcp-environment-analysis.md`
4. `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\analysis\openclaw-vk-third-party-vs-sdd-table.md`
5. `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\docs\architecture\vk-callback-release.md`
6. `D:\project\openclaw-official-vk\docs\local\context\openclaw_vk\security\vk-channel-hardening.md`

## What Still Needs To Be Done

## 2026-04-07 Debugging Postmortem

### Why the last sessions took too long

The time cost was not primarily "VK is hard". It came from three overlapping factors:

- product-path drift: the work started from a broader SDD target and then moved into an
  official-style bundled extension path without an early stop/go checkpoint against mature
  community plugins
- mixed verification modes: we alternated between source-mode probes, stale `dist` artifacts,
  temporary harnesses, and live VK checks, which made failures look like one bug when they were
  actually different layers
- hidden generic runtime stalls: a large part of the delay was inside shared reply-dispatch
  machinery, not inside VK transport logic

### What the long debugging actually produced

The late debugging was still useful because it isolated and removed the main "mystery stall"
inside generic dispatch:

- a synthetic `dispatchReplyFromConfig(...)` path previously took about 189 seconds to finish
- the dominant costs were eager runtime loads in shared reply flow:
  - broad abort runtime loading
  - TTS runtime loading even when TTS was effectively off
  - route-reply runtime loading even when no originating route was needed
- after the targeted lazy-load fixes and skip paths, the same synthetic dispatch path dropped to
  about 2.7 seconds

That means the remaining work is no longer an unbounded VK-specific unknown.

### What still blocks the full live roundtrip

After the dispatch stall was reduced, the remaining blockers shifted to verification/runtime seams:

- source-mode synthetic VK probes now enter the real inbound path but hit source-loader/runtime
  issues such as missing `*.runtime.js` boundaries under source execution
- `dist`-based probes can fail fast with stale-build symptoms such as
  `channels.vk: unknown channel id: vk`
- there is still at least one more shared reply-path optimization left:
  avoid loading abort runtime for obvious direct non-abort text

### Recommended rule to avoid another 40-hour cycle

Future work should be time-boxed with explicit stop criteria:

- pick one lane at a time:
  - product delivery via a mature community plugin
  - official bundled channel work
  - source-only debugging
  - built-artifact/live verification
- do not mix source-mode probes and stale `dist` validation in the same debugging pass
- if a bounded task does not produce a green result or a clear root cause within 60 to 90 minutes,
  stop and reassess instead of widening the search

### Current best next step

If continuing the bundled path, the best immediate bounded task is:

- finish the cheap non-abort precheck so direct text does not load abort runtime unnecessarily
- rerun only the focused regression for that behavior
- then choose one verification lane:
  - source-mode boundary cleanup
  - or fresh-build/live verification

Do not continue broad "full stack" debugging until that lane decision is explicit.

## 2026-04-07 Assessment Against Community VK Plugins

### Comparison refresh

The copied analysis in `docs/local/context/openclaw_vk/docs/analysis/` established that the strongest
community baseline was:

- `pfrankov/openclaw-vk` for production-oriented Long Poll feature breadth
- `Perevalov/openclaw-vkbots-plugin` for clean plugin-sdk architecture

That conclusion is still directionally correct, but the current bundled `extensions/vk` has now
closed several gaps that were missing in the original market scan:

- official-style bundled `createChatChannelPlugin` integration
- both `callback-api` and `long-poll` transports
- `confirmation` callback flow
- gateway-level `message_event` routing
- VK keyboard/button surface and hidden command payloads
- typing/activity wiring
- direct + group chat support
- pairing / allowlist / dmPolicy / groupPolicy
- setup / probe / status surfaces
- media upload pipeline
- broader in-repo unit and integration coverage

### Practical product conclusion

If the product requirement is only "VK bot UX like Telegram for DMs and group chats", a community
plugin is already viable and may be faster to use than finishing our own official-style extension.

Continuing the bundled `extensions/vk` is justified only if one or more of these are required:

- a repo-owned bundled OpenClaw extension rather than a third-party dependency
- `Callback API` as a first-class transport, not Long Poll only
- unified OpenClaw plugin-sdk integration, setup, status, and future upstreamability
- internal ownership of tests, hardening, and maintenance

### Remaining high-value gap

The main remaining blocker is no longer transport or basic VK bot UX. The live roundtrip is blocked
inside the generic reply-dispatch path after inbound DM dispatch enters
`dispatchReplyWithBufferedBlockDispatcher(...)`.

Observed narrowing:

- inbound transport works live against VK
- DM routing resolves to the default agent route (`agent:main:main`)
- inbound session recording completes
- the current stall happens after `recordInboundSession` and before the full reply path returns
- a related runtime/config symptom still appears during deep probes:
  `Invalid config ... channels.vk: unknown channel id: vk`

### Latest verification narrowing

The newest synthetic verification pass established a more specific split between state pollution and
real runtime cost:

- a dirty synthetic agent dir can retain stale providers such as `ollama` in `agents/main/agent/models.json`
  because `models.mode` defaults to `merge`
- that stale provider state was the reason deep synthetic probes still showed loopback sockets to
  `127.0.0.1:11434`
- running the same compiled synthetic VK smoke on a clean agent dir removed the stale `ollama`
  provider and removed the `11434` sockets
- forcing `models.mode: "replace"` on the same synthetic state produced the same clean result
- this means the remaining ~100 second synthetic runtime is not explained by stale merged `ollama`
  state anymore
- a direct local request to the configured proxy endpoint
  (`http://127.0.0.1:8317/v1/chat/completions` for `gpt-5.4-proxy`) returned in about `2.3s`
  for a trivial prompt, so the remaining synthetic delay is not caused by raw proxy endpoint latency

Practical rule:

- for isolated synthetic or live verification, prefer a clean agent dir
- if reusing an existing synthetic state is unavoidable, use `models.mode: "replace"` for a
  proxy-only lane instead of trying to "fix" merge semantics in core

### Decision rule for future work

- If the goal is operational VK support soon: prefer a mature community plugin, especially
  `pfrankov/openclaw-vk`.
- If the goal is an official-quality bundled OpenClaw VK channel with callback transport and
  upstream-friendly architecture: continue the current `extensions/vk` branch and fix the remaining
  reply-dispatch/runtime integration blocker.

### Immediate next steps

- review the integrated `extensions/vk` diff in the new repo
- stage and create the first meaningful commits in `D:\project\openclaw-official-vk`
- run another targeted verification pass before the first commit if anything changes

### Before live usage

- verify setup and troubleshooting flow inside the new official clone
- confirm whether callback server registration helpers should be added or kept manual
- prepare final release-facing docs if they need to live with the extension itself

### For staging or live smoke

The following real values will be needed from the user later:

- VK group or community id
- VK group token
- callback secret
- confirmation code
- public HTTPS webhook URL

### Final production validation

- run real callback confirmation flow
- run DM smoke
- run group mention smoke
- run `message_event` smoke
- run media upload smoke
- run replay and duplicate event smoke

## Suggested Prompt For The Next Session

```text
We are continuing work in D:\project\openclaw-official-vk on branch feature/vk-extension-integration.
First read D:\project\openclaw-official-vk\docs\local\START-HERE.md
and then D:\project\openclaw-official-vk\docs\local\vk-session-handoff.md.
Treat D:\project\openclaw-official-vk as the canonical repo.
Do not use D:\project\openclaw.
Do not commit the local SDD from D:\project\openclaw_vk\temp\local_docs\openclaw-vk-sdd.md.
Node version on this machine must not be changed.
Continue from the current uncommitted VK extension integration state.
```

## Quick Commands

```powershell
git status --short --branch
corepack pnpm install
corepack pnpm vitest run --config vitest.extensions.config.ts
```

## 2026-04-07 Later bounded localization

- The old `proxy` provider normalization path was forcing an unintended full plugin-registry load
  when `providerRefs` resolved to no owning plugin ids.
- That full-registry fallthrough was the reason broad non-provider plugins such as `browser`,
  `device-pair`, and `memory-core` appeared in the synthetic VK trace during config materialization.
- Fixed in `src/plugins/providers.runtime.ts` by returning early when the runtime provider scope
  resolves to zero enabled provider plugins instead of falling through into
  `resolveRuntimePluginRegistry(...)`.
- Regression coverage added in `src/plugins/providers.test.ts`:
  `does not fall back to the full runtime registry for explicit provider refs with no owner`
- Direct source repro for `normalizeProviderSpecificConfig("proxy", ...)` dropped from a
  multi-minute / timeout path to about `25s`.
- Compiled synthetic VK trace moved forward substantially:
  - `get-reply -> before-runPreparedReply` now succeeds
  - `runPreparedReply` preflight now succeeds
  - `runReplyAgent` preflight compaction and memory flush are effectively instant
  - current remaining stall is inside `runAgentTurnWithFallback(...)` in
    `src/auto-reply/reply/agent-runner-execution.ts`

### Current timing snapshot

- `config materialize after-model`: about `29-30s`
- `loadPiEmbeddedRuntime`: about `12s`
- `runReplyAgent` preflight before model turn: under `300ms`
- remaining timeout budget is then spent inside `runAgentTurnWithFallback(...)`

### Next best bounded step

- Instrument `src/auto-reply/reply/agent-runner-execution.ts` around:
  - `runWithModelFallback(...)`
  - `buildEmbeddedRunExecutionParams(...)`
  - `runEmbeddedPiAgent(...)`
- Goal: separate internal execution/setup cost from external model/provider latency.

## 2026-04-07 Auth probe hot path narrowing

- Added env-gated traces in:
  - `src/plugins/capability-provider-runtime.ts`
  - `src/plugin-sdk/provider-auth.ts`
  - `src/agents/tools/model-config.helpers.ts`
- Those traces proved the current media/tool slowdown was not bundled capability discovery anymore.
  `resolvePluginCapabilityProviders(...)` was returning from the already-loaded active registry in
  about `0-1ms` for `mediaUnderstandingProviders`, `imageGenerationProviders`,
  `videoGenerationProviders`, and `musicGenerationProviders`.
- The actual hot path was repeated auth probing in `resolveEnvApiKey(...)` via
  `resolvePluginSetupProvider(...)`.
  Before the fix, several first-time provider auth checks were individually expensive:
  - `fal`: about `862-914ms`
  - `google`: about `807-837ms`
  - `openai`: about `921ms`
  - `xai`: about `809ms`
- Root cause:
  `resolvePluginSetupProvider(...)` was doing a per-provider discovery + manifest + `setup-api`
  module load on cache miss, even though `resolvePluginSetupRegistry()` already had a shared
  registry cache for setup providers.
- Fix:
  `src/plugins/setup-registry.ts` now resolves setup providers from the cached
  `resolvePluginSetupRegistry()` result instead of rebuilding the setup lookup path per provider.
- This materially reduced the synthetic VK roundtrip:
  - before this fix, the latest synthetic `handle-ok` was around `71.1s` with tool construction
    around `8.5s`
  - after this fix, the same synthetic lane reached `handle-ok` in about `69.0s`
  - `create-openclaw-tools after-core-openclaw-tools` dropped to about `7.1s`
  - `createImageTool` dropped to about `357ms`
  - `createVideoGenerateTool` dropped to about `3.7s`
  - `createPdfTool` dropped to about `4.9s`
- Remaining large cost is still in media tool auth probing, but it is now much narrower:
  - image generation still pays `fal ~862ms`, `google ~837ms`, `openai ~921ms`
  - pdf/media still pays a `google ~827ms` auth probe
- Practical conclusion:
  the next best bounded optimization should target provider-auth probing itself, especially the
  repeated expensive providers in image-generation and pdf registration, not capability registry
  loading.

## 2026-04-08 Static env auth candidate hot path

- Root cause:
  `src/agents/model-auth-env.ts` rebuilt the provider env candidate map on every
  `resolveEnvApiKey(...)` call, even though `src/agents/model-auth-env-vars.ts` already exports a
  stable `PROVIDER_ENV_API_KEY_CANDIDATES` constant.
- Fix:
  `src/agents/model-auth-env.ts` now reads provider candidates from the prebuilt constant instead
  of calling `resolveProviderEnvApiKeyCandidates()` per auth probe.
- Regression coverage:
  `src/agents/model-auth-env.test.ts` now verifies the static candidate map is used without
  rebuilding the candidate registry per call.
- Validation:
  - `corepack pnpm test src/agents/model-auth-env.test.ts`
  - `corepack pnpm test src/agents/model-auth.profiles.test.ts`
  - `corepack pnpm exec tsdown --config-loader unrun --logLevel warn`
- Synthetic replay result:
  - individual `provider-auth` / `tool-auth` checks dropped into the `~16-55ms` range
  - `create-openclaw-tools after-core-openclaw-tools` dropped further to about `4.0s`
  - the same replay still reached `handle-ok`, but overall remained about `86.2s`
- Practical conclusion:
  provider auth probing was no longer the top-level blocker after this fix; the remaining runtime
  cost had moved farther down the shared agent/runtime path.

## 2026-04-08 Seeded workspace state hot path

- New trace after the auth fix showed a large, non-VK hotspot on the seeded workspace fast path:
  `ensureAgentWorkspace(...) -> readWorkspaceSetupState(...)` was taking about `11.7s` even though
  the state file itself is only a tiny local JSON file.
- Local confirmation:
  direct shell reads of
  `C:\\Users\\user\\AppData\\Local\\Temp\\openclaw-vk-live-e2e-clean-merge\\workspace\\.openclaw\\workspace-state.json`
  completed in about `0.1ms` after warmup, which pointed to `fs/promises` queue contention rather
  than real disk I/O.
- Fix:
  `src/agents/workspace.ts` now reads `workspace-state.json` via `syncFs.readFileSync(...)` on the
  seeded-workspace hot path instead of `await fs.readFile(...)`.
- Regression coverage:
  `src/agents/workspace.test.ts` now verifies the already-seeded second pass returns without using
  `fs.promises.readFile(...)`.
- Validation:
  - `corepack pnpm test src/agents/workspace.test.ts`
  - `corepack pnpm exec tsdown --config-loader unrun --logLevel warn`
- Synthetic replay result after this fix:
  - `before-readWorkspaceSetupState -> after-readWorkspaceSetupState`: `~1ms`
  - `hot-return-seeded-workspace`: `~4ms`
  - `after-core-openclaw-tools`: `~3.9s`
  - `handle-ok`: `~74.0s`
- Current timing snapshot after the workspace fix:
  - `after-loadPiEmbeddedRuntime`: `~9.3s`
  - `after-buildFollowupRun`: `~13.0s`
  - `after-ensureRuntimePluginsLoaded`: `~18.3s`
  - `after-ensureOpenClawModelsJson`: `~22.0s`
  - `after-resolveModelAsync`: `~28.1s`
  - `after-createOpenClawCodingTools`: `~4.8s` inside the embedded attempt
  - `after-activeSessionPrompt`: `~13.7s` inside the embedded attempt
  - `after-runEmbeddedPiAgent`: `~42.8s`
  - `after-runReplyAgent`: `~61.5s`
- Practical conclusion:
  the next best bounded step is no longer workspace or provider-auth. The biggest remaining
  candidate seams are now:
  - `ensureRuntimePluginsLoaded(...)`
  - the embedded attempt path around session/MCP/docs/bootstrap work before prompt execution
  - post-run reply finalization after `runAgentTurnWithFallback(...)`
