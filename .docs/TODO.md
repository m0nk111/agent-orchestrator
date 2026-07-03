# TODO — Full Build-Out Checklist

Every concrete task this fork's plan (`DECISIONS.md`, `ROADMAP.md`, `rfcs/`)
implies, broken down as granularly as currently possible. Nothing here is
done. Check items off as they land; if a task turns out to be wrong/
unnecessary once you're in the code, strike it with a note rather than
silently deleting it, so the record stays honest.

Organized by phase (matches `ROADMAP.md`), each phase maps to one RFC.
Cross-cutting tasks that don't belong to a single phase are at the bottom.

> **Before checking anything off, read [`AGENT-PROMPT.md`](AGENT-PROMPT.md).**
> In short: build in this fork first, don't gate on upstream acceptance, and
> no item here counts as done without real test evidence — e2e over mocks
> wherever the repo's existing test infrastructure allows it.

---

## Phase 1 — `AO_HOME` portability ([RFC 001](rfcs/001-ao-home-portability.md))

### Backend (Go)
- [x] Add `AO_HOME` recognition to `backend/internal/config/config.go` — feat(config) f9d60d58; gate `go test -race ./...` PASS (exit 0, all packages green).
- [x] `defaultStateDir()`: precedence `AO_HOME` → `$HOME/.ao` (unchanged default) — same commit; `TestLoadAOHome/AO_HOME_alone...` PASS, `neither_set_falls_back_to_$HOME/.ao` PASS.
- [x] Treat empty-string `AO_HOME` as unset (consistent with how `AO_PORT` etc. already handle empty values) — same commit; `TestLoadAOHome/empty_AO_HOME_is_treated_as_unset` PASS (`os.LookupEnv + raw != ""`).
- [x] Update `Load()`'s doc comment (recognized env var list) to include `AO_HOME` — same commit; doc comment lines updated.
- [x] Confirm `AO_DATA_DIR` / `AO_RUN_FILE` still win when explicitly set, over `AO_HOME` — same commit; `TestLoadAOHome/AO_RUN_FILE_keeps_winning_over_AO_HOME` PASS, `..._AO_DATA_DIR_keeps_winning_over_AO_HOME` PASS.
- [x] `backend/internal/adapters/runtime/conpty/ptyregistry/registry.go`: stop duplicating home-dir resolution in `registryFile()`; respect `AO_HOME` — feat(ptyregistry) 137c3052; gate `go test -race ./...` PASS (all packages green).
- [ ] Decide: does AO create `AO_HOME` if it doesn't exist yet, or error? (mirror existing `MkdirAll` behavior used elsewhere, e.g. `runfile.Write`) — BLOCKED: explicit user decision needed in DECISIONS.md; cannot proceed until that's settled (RFC 001 silent).
- [x] Windows path handling: verify `AO_HOME` with drive letters / backslashes resolves correctly in `filepath.Join` calls — eeb8e793; `TestLoadAOHome/Windows-style_AO_HOME...` PASS and `TestLoadAOHome/mixed-slash_AO_HOME...` PASS. `defaultStateDir()` returns the `AO_HOME` value verbatim (so backslashes survive); only the appended `running.json` / `data` segment is joined with the host separator, which Go's `filepath.Join` does correctly on both linux and windows.

### Frontend (Electron)
- [x] `frontend/src/main.ts`: `app.setPath("userData", …)` reads `AO_HOME` before falling back to `os.homedir()` — feat(electron) 1885ddf8 (`resolveUserDataParent` helper used at the call site).
- [x] Verify `process.env.AO_HOME` is actually readable at the point `app.setPath` is called (before `app.ready`) — confirm no Electron env-loading order issue — same commit; `process.env` is synchronously populated at process start, the helper does a plain lookup, no deferred read needed.
- [x] `frontend/src/shared/telemetry.ts`: `defaultDataDir()` adds an `AO_HOME` tier ahead of `$HOME/.ao/data` — feat(telemetry) df3bb0b2 (`AO_DATA_DIR` > `AO_HOME` > `$HOME/.ao/data`).
- [x] `frontend/src/shared/daemon-discovery.ts`: `defaultRunFilePath()` actually wires in its currently-unused `_env` parameter to check `AO_HOME` — feat(daemon-discovery) 874a49e0 (also picks up `AO_RUN_FILE` while we're at it; precedence `AO_RUN_FILE` > `AO_HOME` > `$HOME/.ao/running.json`).

### Tests
- [x] `config_test.go`: `AO_HOME` alone → used; `AO_HOME` + `AO_DATA_DIR` both set → `AO_DATA_DIR` wins; neither set → `$HOME/.ao` — covered by `TestLoadAOHome` in f9d60d58 (5/5 sub-cases PASS).
- [x] `ptyregistry_test.go`: same precedence, Windows-registry-specific — covered by `TestRegistryFileAOHome` in 137c3052 (3/3 sub-cases PASS).
- [x] `telemetry.test.ts`: `defaultDataDir` precedence including `AO_HOME` — covered by df3bb0b2 (4 new sub-cases PASS).
- [x] `daemon-discovery.test.ts`: `defaultRunFilePath` precedence including `AO_HOME` — covered by 874a49e0 (4 new sub-cases PASS; full file 20/20).
- [ ] Cross-platform smoke: `AO_HOME` override exercised on Linux, macOS, Windows (CI matrix or manual) — BLOCKED: this iteration is Linux-only; CI matrix needs to be added by a follow-up. Existing cross-platform Go tests already exercise `filepath.Join` semantics, but a dedicated AO_HOME smoke on darwin/windows remains to be set up.

### Docs
- [x] `AGENTS.md`: update the "All app state lives under `~/.ao` only" hard rule to mention `AO_HOME` — aab7b7b4.
- [x] `frontend/src/landing/content/docs/cli.mdx`: add an `AO_HOME` row to the env var table — aab7b7b4 (also reworded the existing `AO_DATA_DIR` row).
- [x] Explicitly document: existing installs are unaffected (default path unchanged) — no migration needed — implicit in the new `AO_HOME` row wording ("Additive: unset falls back to the default"); flagging here so this stays visible for reviewers.
- [x] `README.md` / quickstart: check for any other `~/.ao` mentions that need the same note — 71dcf41b (added `AO_HOME` row to README env-var table; docs/cli/README.md rewording is conservative deferred until Phase 2's provider gateway review).

---

## Phase 2 — Provider gateway ([RFC 002](rfcs/002-provider-gateway-architecture.md)) — first module ([RFC 006](rfcs/006-modular-architecture.md))

### Research (do first, blocks everything else in this phase)
- [ ] Per-adapter env var audit: for each of the 23 adapters, document which env var(s) its underlying CLI reads for a custom base URL / API key / model override (table: adapter id → base-URL var → API-key var → model var → notes). Start with `opencode` (Guardian-style pattern already used elsewhere on this host), then `claude-code` (`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_MODEL`, already confirmed), then work through the rest: `aider`, `amp`, `auggie`, `autohand`, `cline`, `codex`, `continueagent`, `copilot`, `crush`, `cursor`, `devin`, `droid`, `goose`, `grok`, `kilocode`, `kimi`, `kiro`, `pi`, `qwen`, `agy`.

#### Per-adapter audit progress (Phase 2 Research #1)
- [x] `opencode` — audit in `.docs/research/opencode-env-audit.md` (commit 21f1403c).
- [x] `claude-code` — audit in `.docs/research/opencode-env-audit.md` "claude-code" section; sourced from `https://code.claude.com/docs/en/env-vars` and `/docs/en/llm-gateway-connect` (verified 2026-07-02).
- [x] `codex` — audit in same file "codex" section; sourced from `https://developers.openai.com/codex/auth` and `/config-basic` and `/config-advanced` (verified 2026-07-02). Key call-out: project-level `.codex/config.toml` **cannot** redefine providers; routing through Bifrost must write `~/.codex/config.toml` (user layer).
- [x] `aider` — audit in same file "aider" section; sourced from `https://aider.chat/docs/config.html` + `/docs/config/api-keys.html` + `/docs/llms/openai-compat.html` (verified 2026-07-02). Gateway knob: `OPENAI_API_BASE` + `OPENAI_API_KEY` (OpenAI-compat). Adapter: zero env-touches (pass-through).
- [x] `cline` — audit in same file "cline" section; sourced from `https://docs.cline.bot/getting-started/authorizing-with-cline` + `/provider-config/anthropic` + `/provider-config/openai` + `github.com/cline/cline/blob/main/apps/cli/README.md` (verified 2026-07-02). Gateway knob: CLI `--baseurl` on `cline auth --provider X` or "Base URL" UI field (BYOK path); `ANTHROPIC_BASE_URL` aux (Claude-Code-subscription path). Adapter: only `APPDATA` Windows lookup (pass-through).
- [x] `copilot` — audit in same file "copilot" section; sourced from `github.com/github/copilot-cli/blob/main/README.md` + `docs.github.com/copilot/concepts/agents/about-copilot-cli` (verified 2026-07-02). Negative finding: GitHub Copilot CLI is hard-bound to GitHub's API; only `GH_TOKEN` / `GITHUB_TOKEN` documented as env input. **No Bifrost gateway route** — adapter is pass-through, AO has no env knob.
- [x] `continueagent` — audit in same file "continueagent" section; sourced from `docs.continue.dev/guides/cli` + `/reference` + `/reference/yaml-migration` + `raw.githubusercontent.com/continuedev/continue/main/extensions/cli/src/env.ts` (verified 2026-07-02). **Clean Bifrost route** via per-model `apiBase` in `~/.continue/config.yaml`; CLI also reads `CONTINUE_API_BASE` (Hub only) and `CONTINUE_GLOBAL_DIR`. Adapter: only `APPDATA` Windows lookup (pass-through).
- [x] `cursor` — audit in same file "cursor" section; sourced from `https://cursor.com/docs/cli/overview` (Playwright-rendered, 2026-07-03) + `https://cursor.com/install` shell script (direct-fetched, 2026-07-03). **Negative finding**: no `CURSOR_API_KEY` / `CURSOR_API_BASE_URL` / `OPENAI_API_KEY` / `CURSOR_API_<MODEL_VAR>` env knobs in any reachable current doc page (every probable URL is 404; docs search index returns 0 hits for `CURSOR_API_KEY`). Cursor is closed-source OAuth-bound to its own billing, no public base-URL override — **no v1 Bifrost gateway route**. Adapter: zero env-touches (pass-through). Binary name: `agent` (primary) and `cursor-agent` (legacy symlink alias) both valid; AO's hardcoded `cursor-agent` still works indefinitely.
- [x] `crush` — audit in same file "crush" section; sourced from `charmbracelet/crush/main/README.md` (env-var table direct-fetched, 2026-07-03) + `internal/cmd/root.go` flags + `internal/config/load.go` (PushPopCrushEnv pattern, direct-fetched, 2026-07-03) + `internal/agent/hyper/provider.go` (HYPER_URL env override, direct-fetched, 2026-07-03) + `internal/env/env.go` (verified 2026-07-03). **Clean Bifrost route via `PushPopCrushEnv`**: any `CRUSH_<VAR>` env var is lifted into the underlying `<VAR>` for provider config resolution then restored (line 168-193 of load.go) — purpose-built for routing-hook injection. README lists 25 `*_API_KEY` direct aliases; only `HYPER_URL` for non-Hyper base-URL is unusual (per-provider `base_url` in `crush.json` with shell-expansion is the only other path). Adapter: single `APPDATA` Windows-only lookup (pass-through).
- [x] `kilocode` — audit in same file "kilocode" section; sourced from `backend/internal/adapters/agent/kilocode/kilocode.go:1-22` (verbatim self-description confirms fork of sst/opencode) + `kilocode.go:166-225` (`KILO_CONFIG_CONTENT` env var with CLI config precedence `global -> KILO_CONFIG -> ./kilo.json -> .kilo/kilo.json -> KILO_CONFIG_CONTENT -> managed`) + `kilocode.go:186-197` (permission mapping) + `Kilo-Org/kilocode/packages/core/src/config/provider.ts` (Provider Schema with `env: []` + `endpoint` per provider, direct-fetched 2026-07-03) + `packages/core/src/plugin/env.ts` (`EnvPlugin` scans per-provider `env: []`, 22 lines, direct-fetched 2026-07-03) + `packages/kilo-docs/pages/ai-providers/*.md` (anthropic/openai/gemini/deepseek/groq/cerebras/bedrock/vertex/fireworks/cloudflare/chutes-ai per-provider env-vars, all direct-fetched 2026-07-03) + `packages/kilo-docs/pages/ai-providers/openai-compatible.md` (the JSON config shape with `npm`, `env`, `options.baseURL`, `options.apiKey`, `models` per provider, lines 80-130, direct-fetched 2026-07-03). **Fourth clean Bifrost route** — adapter is pass-through (single `APPDATA` Windows lookup at kilocode.go:259, no API key, no base URL touches) and **already writes JSON via `KILO_CONFIG_CONTENT`** for permission modes, so the Bifrost gateway entry can piggyback on the same wiring (extend the JSON with a `provider` block). Provider registry uses AI SDK family via `npm` (`@ai-sdk/openai-compatible` / `@ai-sdk/openai` / `@ai-sdk/anthropic`); per-provider `baseURL` only via config, no global `KILO_BASE_URL` env knob. **No adapter change needed**.
- [x] `amp` — audit in same file "amp" section; sourced from `backend/internal/adapters/agent/amp/amp.go:1-7` (verbatim self-description, no hooks by design) + `amp.go:62-127` (launch/restore argv with Claude-Code-shaped `--permission-mode`) + `amp.go:137-146` (permission mode mapping) + `amp.go:166` (single `APPDATA` Windows lookup) + `https://ampcode.com/install.sh` direct-fetched (install-time envs `AMP_HOME`, `AMP_STORAGE_BASE`, `AMP_URL`, `AMP_VERSION`, none relevant to runtime) + `https://ampcode.com/manual` direct-fetched (runtime envs `AMP_API_KEY`, `AMP_FORCE_BEL`, `AMP_SKIP_UPDATE_CHECK`, `HTTP_PROXY`, `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`, `EDITOR`; settings namespace `amp.*` with 16+ UI settings, **none** provider-routing) + `https://ampcode.com/models` direct-fetched (no per-vendor base-URL knobs documented) + registry.npmjs.org/@ampcode/cli direct-fetched (`bin/amp.exe` only — closed-source binary, 456 prerelease versions). **Negative finding**: no `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` / `AMP_BASE_URL` / `AMP_API_BASE_URL` documented in any reachable page of `ampcode.com`; the WebSearch "claim" of inherited `ANTHROPIC_*` is hypothetical (Amp CLI's `--permission-mode` spelling matches Claude Code adapter's, but the SDK env knobs are not surfaced in user docs). **`AMP_API_KEY` authenticates to `threads.ampcode.com`, not to a vendor model API** — would not transparently Bifrost-route. Adapter: single `APPDATA` Windows lookup (pass-through). **No clean Bifrost route in v1**; adapter unchanged.
- [x] `auggie` — audit in same file "auggie" section; sourced from `backend/internal/adapters/agent/auggie/auggie.go:1-37` (verbatim self-description: headless `--print` mode, no blanket-bypass flag) + `auggie.go:98-156` (launch/restore argv shape) + `auggie.go:191` (single `APPDATA` Windows lookup) + `auggie_test.go:71-97` (`TestGetLaunchCommandPermissionModesEmitNoFlag`: every permission mode emits just `auggie --print`, no flag) + `registry.npmjs.org/@augmentcode/auggie/latest` direct-fetched (`bin/auggie → augment.mjs`, closed-source compiled bundle) + `https://augmentcode.com` direct-fetched (BYOK marketing copy without env-var names) + `https://docs.augmentcode.com/cli/overview` direct-fetched (only `--print` and `--quiet` documented as CLI flags; login is `auggie login`) + `https://docs.augmentcode.com/models` direct-fetched (`/model` slash command and `--model` flag are the only model-pick knobs; quoted verbatim from the page) + `https://docs.augmentcode.com/models/available-models` direct-fetched (no env vars; Prism router is internal, not user-routable). **Negative finding**: no `AUGMENT_*` env-var family exists in any reachable docs page; auth is via `auggie login` (OAuth-bound to Augment's billing like Cursor), `--model` only selects from Augment's curated list (Prism variants + Claude Opus 4.7 / Gemini 3.1 / GPT 5.4/5.5 / Kimi), no BYOK env plumb. GitHub presence: `gh api orgs/augmentcode/repos --paginate` does not return a `auggie` source repo under the augmentcode org (the CLIs source is closed-source compiled `.mjs`). Adapter: single `APPDATA` Windows lookup (pass-through). **No clean Bifrost route in v1**; adapter unchanged.
- [x] `autohand` — audit in same file "autohand" section; sourced from `backend/internal/adapters/agent/autohand/autohand.go:1-11` (verbatim self-description confirms CLI/non-interactive command mode, native `autohand resume <sessionId>`, hook/lifecycle system mapped onto activity states) + `autohand.go:75-99` (launch argv shape `autohand [--path <workspace>] [<approval flags>] [--sys-prompt <value>] [-- <prompt>]`) + `autohand.go:115-134` (restore argv shape `autohand resume [--path <workspace>] <sessionId>`, **no approval flags on resume**) + `autohand.go:165-176` (permission mapping: Default→no flag, AcceptEdits→`--yes`, Auto→`--unrestricted`, BypassPermissions→`--unrestricted`) + `autohand.go:88-92` (system prompt `--sys-prompt <file-or-string>` auto-detect) + `autohand.go:211` (single `APPDATA` Windows lookup) + `autohandai/code-cli/main/.env.example` direct-fetched (5 vars: `AUTOHAND_API_URL` default `https://api.autohand.ai` = **base-URL knob**, `AUTOHAND_SECRET` for feedback auth, `AUTOHAND_CONTEXT_COMPACT`, `AUTOHAND_CONTEXT_WINDOW`, `AUTOHAND_RESERVE_TOKENS` default 16000) + `autohandai/code-cli/main/src/config.ts` direct-fetched (process.env reads: `AUTOHAND_API_URL`, `AUTOHAND_SECRET`, `AUTOHAND_CONFIG`, AZURE_OPENAI_KEY/ENDPOINT/DEPLOYMENT/API_VERSION + AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET, AWS_REGION, AWS_DEFAULT_REGION; `defaultBaseUrlFor` returns 11 base URLs: openrouter, ollama, llamacpp, openai, mlx, llmgateway, zai, sakana, deepseek, bedrock, nvidia) + `autohandai/code-cli/main/README.md` direct-fetched (table names **9 explicit providers**: openrouter, llmgateway, openai, bedrock, deepseek, ollama, llamacpp, mlx, zai) + `autohandai/code-cli/main/src/providers/` (24 provider-class files including NVIDIA, Cerebras, VertexAI, XAI/Grok, Sakana, LlamaCpp, MLX, plus `CustomOpenAICompatibleProvider.ts` for the custom-provider glue) + `autohandai/code-cli/main/src/providers/customProviders.ts` direct-fetched (`CUSTOM_PROVIDER_PREFIX="custom:"`, `normalizeCustomProviderId`, `parseCustomProviderName`, `getCustomProviderConfig(config, provider)` reads `config.customProviders[id]` — **the Bifrost-shaped OpenAI-compat seam**) + `autohandai/code-cli/main/src/providers/DeepSeekProvider.ts` direct-fetched (representative pattern: `DEEPSEEK_DEFAULT_BASE_URL="https://api.deepseek.com"`, constructor resolves `effectiveConfig.baseUrl = config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL` — explicit per-provider base-URL resolution). **Fifth clean Bifrost route** with **two clean injection points**: (a) `AUTOHAND_API_URL` env var = base-URL knob for Autohand's own telemetry/feedback server; (b) `custom:` provider prefix + `config.customProviders` map = OpenAI-compatible Bifrost seam. Adapter: single `APPDATA` Windows lookup (pass-through). **No adapter change needed**.
- [ ] `devin`, `droid`, `goose`, `grok`, `kimi`, `kiro`, `pi`, `qwen`, `agy`, `vibe` — to do.
- [ ] Decide Bifrost distribution mechanism: vendored binary download on first run, Docker container, or system package expectation
- [ ] Confirm Bifrost's own bind-host default and whether it can be pinned to loopback-only (must match AO's own security posture)

### `internal/providers/` module scaffolding
- [ ] Package skeleton: config, lifecycle (start/stop/health), credential handling
- [ ] Bifrost config file generation from AO's own provider config
- [ ] Sidecar process supervision: start on daemon boot, health-check loop, restart-on-crash, graceful shutdown tied to daemon lifecycle (mirror how the daemon already supervises runtimes)
- [ ] Bifrost's own data (config, cache, logs) stored under `AO_HOME` (depends on Phase 1)
- [ ] Decide credential storage: new SQLite table vs. env-var-only passthrough vs. encrypted-at-rest file
- [ ] If SQLite: new migration for provider config/credentials (append-only, never edit merged migrations)
- [ ] Decide: one shared Bifrost instance for the whole AO install, or per-project — default to shared unless a reason emerges not to

### Domain / service / API
- [ ] `domain.AgentConfig` / `ProjectConfig`: add typed provider + model fields (keep the existing typed-fields convention, not a free-form map)
- [ ] `Validate()` rules for the new fields
- [ ] `session_manager`: resolve a project's provider/model selection into the right `Config.Env` entries at spawn time
- [ ] `backend/internal/httpd/controllers/dto.go`: extend `ProjectConfig` DTO with provider/model fields
- [ ] `backend/internal/httpd/apispec/specgen/build.go`: register any new named types
- [ ] `npm run api` — regenerate `openapi.yaml` + `frontend/src/api/schema.ts`, commit together with the Go change
- [ ] CLI: `ao project set-config --provider <id> --model <name>` flags (mirrors existing `--model`/`--permission` flags in `project.go`)

### Doctor / health
- [ ] `ao doctor`: Bifrost reachability check (`/v1/models`-equivalent)
- [ ] `ao doctor`: credential-presence checks per configured provider
- [ ] New HTTP route wrapping doctor's provider checks so the dashboard can query the same signal (design once, shared with Phase 3's doctor work — don't build two separate routes)

### Frontend
- [ ] `ProjectSettingsForm.tsx`: provider dropdown + model picker, fed by Bifrost's `/v1/models`
- [ ] Graceful "Bifrost not running" state in the UI (prompt to start setup, don't crash)

### Tests
- [ ] Go: provider config resolution, Bifrost config generation, doctor checks — `httptest`-based, no real network calls per repo convention
- [ ] Frontend: provider/model picker component tests

### Docs
- [ ] `docs/architecture.md` / `docs/backend-code-structure.md`: add `internal/providers/` package description
- [ ] `AGENTS.md` "where to look first" table: new row for provider work
- [ ] Ops note (not code): how to configure Guardian as a Bifrost backend for local model serving

### Open items to resolve during this phase
- [ ] What happens to a running agent session if Bifrost crashes mid-session? (define behavior, don't leave undefined)
- [ ] Confirm Bifrost's own security posture doesn't regress AO's loopback-only guarantee

---

## Phase 3 — Framework capability registry ([RFC 003](rfcs/003-framework-capability-registry.md))

### Doctor extension (mechanical, unblocked)
- [ ] Enumerate all 23 adapters and each one's existing `Resolve<X>Binary`-equivalent function
- [ ] Generalize `doctor.go`'s `doctorHarnesses` (currently 2 entries) to cover all 23
- [ ] Handle per-adapter version-flag differences (not every CLI supports `--version` identically)
- [ ] Expose the full per-adapter doctor result over the HTTP route from Phase 2 (one shared design, not a second route)

### Open question A — resolve before auto-install work
- [ ] Decide concretely what "controlled environment" means: disposable worktree, opt-in `ao setup --install <agent>` with dry-run preview, container, or something else
- [ ] Document the decision in `DECISIONS.md` once made

### Auto-install (blocked on the above)
- [ ] Design `ao setup --install <agent>` (or equivalent) command surface, dry-run-by-default
- [ ] Per-adapter install recipe research + implementation (npm global install, curl installer script, Homebrew, platform installer — each adapter likely needs its own recipe)
- [ ] Explicit opt-in required for every install action — never silent/background from a health-check probe
- [ ] Extend the controlled-environment design to cover installing **supporting services** (SearXNG etc., Phase 4) — same safety boundary, not a separate design pass
- [ ] Docker availability check if any install recipe needs it

### Capability registry (ongoing maintenance, not a runtime feature)
- [ ] Create a maintained data file (e.g. `capabilities.yaml` or similar) listing per adapter: native skill support, native MCP support, hook support, currently-tracked upstream version
- [ ] Define a recurring review process/checklist (how often, who/what reviews upstream framework releases and updates the file)

### Tests
- [ ] Doctor extension: per-adapter probes with mocked binaries
- [ ] Install dry-run preview logic

### Docs
- [ ] `docs/cli/README.md`: document the extended `ao doctor` and new `ao setup` commands

---

## Phase 4 — Cross-framework skills & tools ([RFC 004](rfcs/004-cross-framework-skills-and-tools.md)) — second module

### SearXNG / shared MCP server
- [ ] Decide SearXNG deployment shape: Docker container, native binary, or Python venv
- [ ] Install/manage SearXNG under `AO_HOME` (Phase 1), supervised by the daemon lifecycle (mirror Phase 2's Bifrost supervision pattern)
- [ ] SearXNG configuration file generation/management owned by AO
- [ ] Confirm SearXNG also stays loopback-only — same security posture as Bifrost and the daemon itself

### Per-adapter MCP registration
- [ ] Research each adapter's native MCP config location/format (Claude Code: `~/.claude.json` / project `.mcp.json`; Cursor: its own location; OpenCode; others — per-adapter, similar shape to Phase 2's env-var audit)
- [ ] Build the registration step per adapter (write/merge MCP server entry into that adapter's native config)
- [ ] Build the prompt-injection fallback for adapters with no native MCP support (using existing `LaunchConfig.SystemPrompt`/`SystemPromptFile` plumbing)
- [ ] Add "MCP support: yes/no" column to Phase 3's capability registry

### General skill format (after the MCP case is proven)
- [ ] Define AO's neutral skill spec on top of the `SKILL.md` convention (frontmatter fields, body shape)
- [ ] Per-adapter translation: write into native skill directories where one exists (e.g. Claude Code's `~/.claude/skills/`)
- [ ] Prompt-injection fallback for adapters with no native skill concept
- [ ] Add "skill support: yes/no" column to the capability registry

### CLI / API / frontend surface
- [ ] CLI: `ao skills install/list/enable/disable` (if a CLI surface is wanted alongside the dashboard)
- [ ] HTTP routes: list available skills/MCP servers + per-adapter compatibility
- [ ] Frontend: skill/MCP management UI (feeds into the Phase 5 wizard, don't build standalone first)

### Tests
- [ ] MCP registration translation per adapter (mocked file writes, no real config mutation in tests)
- [ ] Skill prompt-injection fallback

### Docs
- [ ] Document the skill format spec and how to add a new skill
- [ ] Document how SearXNG fits into the module convention (RFC 006) as the second real module

---

## Phase 5 — Dashboard wizard UX ([RFC 005](rfcs/005-web-dashboard-ux.md))

### Open question B — resolve before design starts
- [ ] Decide: Electron-hosted redesign only, or also plain-browser-reachable without the Electron shell
- [ ] If browser-reachable: add HTTP static-serving for the built renderer + a `http://127.0.0.1:<port>` entry in the CORS allowlist alongside `app://renderer`
- [ ] Document the decision in `DECISIONS.md` once made

### Immediate gap (independent of the open question)
- [ ] `ProjectSettingsForm.tsx`: first env-editing UI (key/value editor for `config.env`) — missing today regardless of anything else

### Wizard (build last, once Phases 2-4 provide real signal)
- [ ] Onboarding/setup flow: welcome → doctor results → provider setup → framework install prompts → skill/MCP setup
- [ ] Wizard completion state persistence; re-offer relevant steps when a new framework/provider is detected later
- [ ] Do not build any wizard screen against placeholder/mock data — each screen waits for its backing signal to exist

### Redesign
- [ ] Broader intuitiveness pass on the existing dashboard, scoped to whichever GUI surface was chosen above
- [ ] Reconcile with `DESIGN.md` if new UI patterns are introduced

### Tests
- [ ] Wizard flow component/e2e tests (repo already has Playwright specs under `frontend/e2e/` — follow that pattern)

---

## Cross-cutting (not owned by a single phase)

### RFC 006 — module convention upkeep
- [ ] Once Phase 4's SearXNG/MCP module exists alongside Phase 2's `internal/providers/`, evaluate whether a shared doctor-check aggregator earns its keep (the "≥2 modules" trigger) — build it then, not before
- [ ] Document the module convention itself somewhere durable (`AGENTS.md` addition or a short `CONTRIBUTING`-style note) once the second module proves the pattern, so future modules follow the same shape without re-litigating it

### Process / hygiene
- [ ] This fork has no `CHANGELOG.md` today (upstream doesn't ship one either) — decide whether to add one for fork-local changes and keep it updated per merged change
- [ ] Keep `DECISIONS.md` and `ROADMAP.md` current as work lands — mark items done, don't let them drift out of sync with `TODO.md`
- [ ] Decide a policy for periodically merging `upstream/main` into this fork so it doesn't drift indefinitely
- [ ] Decide fork versioning: track upstream's version scheme or branch off independently

### Security review (do once Phase 2 + Phase 4 both ship)
- [ ] Full review pass once Bifrost, SearXNG, and auto-install are all in place together — three new attack-surface additions on top of AO's existing no-auth, loopback-only daemon
- [ ] Confirm every new supervised process (Bifrost, SearXNG) stays strictly loopback-only, matching AO's own daemon rule
- [ ] Confirm credential storage (API keys for Bifrost's providers) never ends up logged or exposed over the dashboard's HTTP/SSE surface unmasked

### Documentation sync
- [ ] Top-level `README.md`: add a note pointing at `.docs/` for this fork's own planning docs
- [ ] Re-check `.docs/DECISIONS.md` / `.docs/ROADMAP.md` / `.docs/rfcs/*` for drift against this file as work actually starts landing
