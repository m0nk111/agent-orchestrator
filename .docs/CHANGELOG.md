# CHANGELOG — autonomous fork loop

This file records what each autonomous loop iteration landed on
`fork/ao-home-and-providers`. Newest entry on top.

## Iteratie 15 — 2026-07-03 (Fase 2 Research: autohand)

**Wat is geland**

- Per-adapter env-var audit continued: `autohand` (Autohand AI Code,
  binary `autohand`, npm `@autohand/code-cli`, upstream repo
  `autohandai/code-cli` — open-source). Section appended to
  `.docs/research/opencode-env-audit.md`.
- Source citations (all direct-fetched or read on 2026-07-03):
  - `backend/internal/adapters/agent/autohand/autohand.go:1-11` —
    verbatim package doc: "Autohand is an autonomous coding agent
    with a non-interactive command mode (`autohand -p <prompt>` /
    positional prompt), native session resume
    (`autohand resume <sessionId>`), and a native hook/lifecycle
    system whose events (session-start, stop, permission-request,
    ...) AO maps onto activity states."
  - `autohand.go:75-99` — launch argv shape
    `autohand [--path <workspace>] [<approval flags>] [--sys-prompt <value>] [-- <prompt>]`.
  - `autohand.go:115-134` — restore argv shape
    `autohand resume [--path <workspace>] <sessionId>` (no
    approval flags on resume).
  - `autohand.go:165-176` — permission mapping table:
    Default→no flag, AcceptEdits→`--yes`, Auto→`--unrestricted`,
    BypassPermissions→`--unrestricted`.
  - `autohand.go:88-92` — system prompt via `--sys-prompt` with
    auto-detect file vs inline.
  - `autohand.go:211` — single env-touch: `os.Getenv("APPDATA")`
    for Windows binary-path resolution (pass-through).
  - `autohand/hooks.go` (337 lines) — full hooks installer;
    manages `~/.autohand/config.{json,toml,yaml,yml}` paths, no
    AO gateway env reads (filesystem pass-through).
  - `autohandai/code-cli/main/.env.example` — direct-fetched.
    Verbatim 5 named env vars: `AUTOHAND_API_URL` (default
    `https://api.autohand.ai`, **the base-URL knob for Autohand's
    own feedback server**), `AUTOHAND_SECRET` (feedback auth),
    `AUTOHAND_CONTEXT_COMPACT`, `AUTOHAND_CONTEXT_WINDOW`,
    `AUTOHAND_RESERVE_TOKENS` (default 16000).
  - `autohandai/code-cli/main/src/config.ts` — direct-fetched.
    `process.env` read list: `AUTOHAND_API_URL`, `AUTOHAND_SECRET`,
    `AUTOHAND_CONFIG`, AZURE_OPENAI_KEY/ENDPOINT/DEPLOYMENT/API_VERSION
    + AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET, AWS_REGION,
    AWS_DEFAULT_REGION. `defaultBaseUrlFor(provider, port?)` exports
    11 base URLs: openrouter, ollama, llamacpp, openai, mlx,
    llmgateway, zai, sakana, deepseek, bedrock, nvidia.
  - `autohandai/code-cli/main/README.md` — direct-fetched.
    "Supported Providers" table names **9 explicit providers**:
    openrouter, llmgateway, openai, bedrock, deepseek, ollama,
    llamacpp, mlx, zai.
  - `gh api repos/autohandai/code-cli/git/trees/main?recursive=1` —
    probed; `src/providers/` directory has 24+ provider-class files
    including NVIDIA, Cerebras, VertexAI, XAI (Grok), Sakana,
    LlamaCpp, MLX, plus the Bifrost-shaped
    `CustomOpenAICompatibleProvider.ts`.
  - `autohandai/code-cli/main/src/providers/customProviders.ts` —
    direct-fetched. **`CUSTOM_PROVIDER_PREFIX = "custom:"`** with
    `normalizeCustomProviderId(input)` / `parseCustomProviderName(provider)`
    / `getCustomProviderConfig(config, provider)` reading
    `config.customProviders[id]`. **The Bifrost-shaped OpenAI-compat
    injection point**.
  - `autohandai/code-cli/main/src/providers/DeepSeekProvider.ts` — direct-fetched.
    Representative pattern: `DEEPSEEK_DEFAULT_BASE_URL="https://api.deepseek.com"`,
    constructor resolves
    `effectiveConfig.baseUrl = config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL`.
    Same shape repeated per provider — explicit per-provider base-URL
    resolution everywhere.
- **Verdict**: **fifth clean Bifrost route**, with two clean injection
  points:
  1. `AUTOHAND_API_URL` env var → Autohand's own
     telemetry/feedback base-URL knob.
  2. `custom:` provider prefix + `config.customProviders.<id>`
     map → OpenAI-compatible model traffic, via
     `CustomOpenAICompatibleProvider` glue.
- **Adapter changes needed**: **none.** Adapter is pass-through
  (single `APPDATA` Windows read). Bifrost's gateway entry is a
  config-file or env-var injection at runtime, no Go code change.
- Audit-internal flags (not Phase-2 blocking):
  - `AUTOHAND_API_URL` is officially scoped to telemetry path
    only, not the model path — Bifrost reuse depends on whether
    Bifrost offers a telemetry-compatible API.
  - `customProviders.ts` `CustomProviderSettings` shape
    (referenced as imported type) wasn't direct-fetched;
    surface for Phase-2 followup if Bifrost adopts the
    `custom:` prefix.
  - `AUTOHAND_CONFIG` env var override (path-to-config) is
    useful for AO_HOME-friendliness; surface for Phase-2
    followup.

**Open audits queue (10)** — `devin`, `droid`, `goose`, `grok`,
`kimi`, `kiro`, `pi`, `qwen`, `agy`, `vibe`.

## Iteratie 14 — 2026-07-03 (Fase 2 Research: auggie)

**Wat is geland**

- Per-adapter env-var audit continued: `auggie` (Augment Code CLI,
  binary `auggie`, npm `@augmentcode/auggie`). Section appended to
  `.docs/research/opencode-env-audit.md`.
- Source citations (all direct-fetched or read on 2026-07-03):
  - `backend/internal/adapters/agent/auggie/auggie.go:1-37` —
    verbatim package doc: "Auggie has no single 'approve
    everything' flag. It governs unattended tool/file approval
    through granular `--permission <tool>:<allow|deny>` rules
    (and a read-only `--ask` mode), not a 4-mode bypass like
    Claude Code. Because there is no verifiable blanket
    auto-approve flag, every AO permission mode emits no flag."
  - `auggie.go:98-117` — launch argv shape
    `auggie --print [--instruction-file <f> | --instruction <s>] [-- <prompt>]`.
  - `auggie.go:142-156` — restore argv shape
    `auggie --print --resume <sessionId>`.
  - `auggie.go:191` — single env-touch: `os.Getenv("APPDATA")` for
    Windows binary-path resolution.
  - `auggie_test.go:71-97` — `TestGetLaunchCommandPermissionModesEmitNoFlag`
    asserts that for every AO permission mode the expected argv is
    `[]string{"auggie", "--print"}` (no flag appended).
  - `registry.npmjs.org/@augmentcode/auggie/latest` — direct-fetched.
    Package metadata: `bin: { "auggie": "augment.mjs" }`,
    `description: "Auggie CLI Client by Augment Code"`,
    `homepage: https://augmentcode.com`. The bin target is a
    compiled `.mjs` bundle, **not** an open-source distribution.
  - `https://augmentcode.com` — direct-fetched. Marketing copy
    mentions "BYOK for models" and "BYOK for models" under
    security/trust badges; **no env-var names, no base-URL
    knob, no flag names** are published on the homepage.
  - `https://docs.augmentcode.com/cli/overview` (and the parent
    `/docs` route) — direct-fetched. Confirms `--print` and
    `--quiet` as the only documented CLI flags. Login is
    `auggie login`. Install is `npm install -g @augmentcode/auggie`.
  - `https://docs.augmentcode.com/models` — direct-fetched. The
    only model-selection knob is **`/model` slash command** or
    **`--model <name>` flag**. Quoted verbatim from the page:

    > "In Auggie CLI, use the `/model` slash command or pass
    > the `--model` flag with the desired model."

  - `https://docs.augmentcode.com/models/available-models` —
    direct-fetched. Confirms there are **no env vars** for any
    of the supported model families. The internal router is
    named **Prism**, quoted verbatim from the page:

    > "Prism lets Augment choose the best-fit model for each
    > request. Instead of locking you into a single model, each
    > Prism option routes within a curated model family…"

  - GitHub org probe via `gh api orgs/augmentcode/repos
    --paginate` — confirms the `augmentcode` org ships
    unrelated repos (DeepSpeed, environments, spark,
    automatic-pull-request-review, etc.) but **no `auggie`
    source repo**. Auggie CLI source is closed-source.
- Adapter env-touches: exactly one — `APPDATA` at `auggie.go:191`
  (Windows binary-path resolution). Zero other reads/writes.
  Adapter is fully pass-through.

**Conclusie**

- **No clean Bifrost route for Auggie in v1.** Same shape as
  Cursor / Amp: closed-source, OAuth-bound, no documented env-var
  surface for base URL or API key. `--model` selects from
  Augment's curated list (Prism-variants + named models)
  but does not let the user specify an external base URL.
- Permission mapping: **none** — every mode emits just
  `auggie --print`, no flag appended (matches the test
  `TestGetLaunchCommandPermissionModesEmitNoFlag`).

**Open questions surfaced**

- The `--model` flat at the CLI level is interesting: if
  Augment ever exposes a "use my own Prism-compatible
  backend" flag (some closed-source CLIs do this), that
  could become a Bifrost seam. Today, none documented. Not
  flagged.

**Verificatie / gates**

- Markdown / section structure verified by `Edit` write state.
  No Go / TS code touched this round — research slice only.
  Gates deferred (no source files modified).

## Iteratie 13 — 2026-07-03 (Fase 2 Research: amp)

**Wat is geland**

- Per-adapter env-var audit continued: `amp` (Sourcegraph Amp CLI,
  binary `amp`, npm `@ampcode/cli`). Section appended to
  `.docs/research/opencode-env-audit.md`.
- Source citations (all direct-fetched or read on 2026-07-03):
  - `backend/internal/adapters/agent/amp/amp.go:1-7` — verbatim
    self-description: "Amp activity hooks and SessionInfo
    derivation will likely require an Amp-specific TypeScript
    plugin, similar to opencode. Until that integration exists,
    hook installation and SessionInfo are intentionally no-ops."
  - `amp.go:62-87` — launch argv shape
    `amp [--permission-mode <mode>] [--append-system-prompt ...] [-- <prompt>]`.
  - `amp.go:108-127` — restore argv shape
    `amp [--permission-mode <mode>] --resume <agentSessionId>`.
  - `amp.go:137-146` — `appendPermissionFlags` mapping table:
    `Default` (no flag), `AcceptEdits` (`acceptEdits`), `Auto`
    (`auto`), `BypassPermissions` (`bypassPermissions`). Note that
    **the spelling exactly matches Claude Code adapter's** —
    strong signal the CLI is in the Claude Code family.
  - `amp.go:166` — single env-touch: `os.Getenv("APPDATA")` for
    Windows binary-path resolution only.
  - `backend/internal/adapters/agent/amp/amp_test.go:62-65` — test
    confirms expected argv pin includes `--permission-mode
    bypassPermissions` between `amp` and `--`.
  - `https://ampcode.com/install.sh` — direct-fetched. Install-time
    envs: `AMP_HOME`, `AMP_STORAGE_BASE`, `AMP_URL`, `AMP_VERSION`.
    None relevant to runtime.
  - `https://ampcode.com/manual` — direct-fetched. Runtime envs:
    `AMP_API_KEY`, `AMP_FORCE_BEL`, `AMP_SKIP_UPDATE_CHECK`,
    `HTTP_PROXY`, `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`, `EDITOR`.
    Settings namespace **`amp.*`** with 16+ documented keys, all
    UX/tooling toggles, **none** are provider-routing.
  - `https://ampcode.com/models` — direct-fetched. No per-vendor
    base-URL knobs; documents models Amp routes through its own
    server.
  - `https://ampcode.com` root + `/docs` doc-tree — both content
    fetched; `/docs` redirects to `authapi.ampcode.com` (auth-walled)
    so we rely on `/manual` and `/models`.
  - `https://registry.npmjs.org/@ampcode/cli` — direct-fetched.
    `bin/amp.exe` only; 456 prerelease versions; no source exposed.
  - GitHub org search via `gh api search/repositories -f
    q="org:sourcegraph amp in:name"` — empty result; **`sourcegraph/amp-cli`
    is not open-source**. The CLI is proprietary-distributed binary.
- Adapter env-touches: exactly one — `APPDATA` at `amp.go:166`
  (Windows binary-path resolution). Zero other reads/writes.
  Adapter is fully pass-through.

**Conclusie**

- **No clean Bifrost route for Amp in v1.** The CLI is closed-source
  and does not expose provider-override knobs in any reachable
  documentation page. `AMP_API_KEY` authenticates to
  `threads.ampcode.com` (Amp's own server), so setting it to a
  Bifrost-issued token would not transparently route model traffic.
- The WebSearch "claim" of `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`
  inheritance from the underlying SDK is **hypothetical** — direct
  fetches of every reachable page of `ampcode.com` found none of
  these knobs documented. We explicitly discard unverified WebSearch
  claims from the audit (`Why: WebSearch tools frequently return
  plausible-sounding but unverified summaries; the audit's policy is
  only cite sources actually fetched and verified`).
- The `--permission-mode` flag values from Amp exactly mirror Claude
  Code's, confirming the family lineage, but the SDK's env surface is
  not surfaced to Amp CLI users.

**Open questions surfaced**

- **Is Amp honoring un-documented `ANTHROPIC_*` env vars from its
  internal SDK?** Options to verify cheaply (not in this iteration):
  - `strings(1)` on `bin/amp.exe` for the literal env-var names it
    probes (one-time research artifact, not a maintainable surface).
  - Sandbox test: set each `ANTHROPIC_*` env var and inspect the
    thread/request response or `~/.config/amp/settings.json`.
  - Contact Sourcegraph for the canonical knob list (long lead,
    out of autonomous loop).
  - **Not flagged as Phase-2 blocking.**
- **`AMP_API_KEY`** — it could in principle be lifted into the
  session by AO without breaking Amp's own auth (AO never uses it
  for actual model traffic) but we have no evidence Bifrost could
  *hit* the Amp server through this token. Surface flagged;
  Phase-2 followup.

**Verificatie / gates**

- Markdown / section structure verified by `Edit` write state.
  No Go / TS code touched this round — research slice only.
  Gates deferred (no source files modified).

## Iteratie 12 — 2026-07-03 (Fase 2 Research: kilocode)

**Wat is geland**

- Per-adapter env-var audit continued: `kilocode` (Kilo-Org fork of
  sst/opencode, binary `kilocode` alias `kilo`, npm `@kilocode/cli`).
  Section appended to `.docs/research/opencode-env-audit.md`.
- Source citations (all direct-fetched 2026-07-03):
  - `backend/internal/adapters/agent/kilocode/kilocode.go:1-22` —
    verbatim self-description: "fork of sst/opencode and shares its
    CLI surface and plugin runtime, so AO bridges it the same two
    ways it bridges opencode".
  - `kilocode.go:166-225` — adapter launches with
    `[env KILO_CONFIG_CONTENT=<json>] kilocode [--prompt ...]`,
    permission mapping at lines 186-197:
    - `Default` → no env
    - `AcceptEdits` → `{"permission":{"edit":"allow"}}`
    - `Auto` → `{"permission":{"edit":"allow","bash":"allow"}}`
    - `BypassPermissions` → `{"permission":{"*":"allow"}}`
  - `kilocode.go:166-173` — CLI config precedence commentary
    (verbatim): **`global -> KILO_CONFIG -> ./kilo.json ->
    .kilo/kilo.json -> KILO_CONFIG_CONTENT -> managed`**, later wins.
  - `Kilo-Org/kilocode/packages/core/src/config/provider.ts` —
    `class Info extends Schema.Class<Info>("ConfigV2.Provider")` with
    `name`, `env: Schema.String[].optional`,
    `endpoint: ProviderV2.Endpoint.optional`, `options`, `models`.
  - `packages/core/src/plugin/env.ts` — 22-line `EnvPlugin` scans
    each `evt.provider.list()`, picks first `env: []` entry that's
    set in `process.env`, then marks that provider
    `enabled: { via: "env", name: <key> }`.
  - `packages/kilo-docs/pages/ai-providers/{anthropic,openai,gemini,
    deepseek,groq,cerebras,bedrock,vertex,fireworks,cloudflare,
    chutes-ai}.md` — per-provider env-vars confirmed:
    `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
    `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`,
    `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `FIREWORKS_API_KEY`,
    `HF_TOKEN`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`,
    `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`
    / `AWS_BEARER_TOKEN_BEDROCK`,
    `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`,
    `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_KEY`
    / `CLOUDFLARE_GATEWAY_ID` / `CLOUDFLARE_API_TOKEN`.
  - `packages/kilo-docs/pages/ai-providers/openai-compatible.md` —
    JSON-shape with `provider.<id>.npm` (AI SDK family),
    `.env` (activation array), `.options.apiKey`, `.options.baseURL`,
    `.models.<model-id>`. Lines 80-130 confirm full-endpoint
    `baseURL` is supported.
- Adapter env-touches: exactly one — `APPDATA` at `kilocode.go:259`
  (Windows binary-path resolution only). Zero other reads/writes.
  Adapter is a clean pass-through.

**Conclusie**

- Kilo is **the fourth clean Bifrost route in the queue** (after
  claude-code, continueagent, crush) and the **cleanest so far**
  because the adapter is *already* a writer for one of the env
  vars in the routing trail:
  1. Kilo already accepts the inline JSON via `KILO_CONFIG_CONTENT`.
     The Bifrost gateway entry can piggyback on the same wiring,
     extending the JSON with a `provider` block (no new env var,
     no config-file write — just extend).
  2. `EnvPlugin`'s activation check scans `env: []`, so a single
     env var per provider (e.g. `KILO_BIFROST_PROVIDER_TOKEN=…`)
     flags it active.
  3. Per-provider `baseURL` is *config-only* — no global
     `KILO_BASE_URL` (or vendor-wide `OPENAI_BASE_URL` /
     `ANTHROPIC_BASE_URL`) is honored. AO must put the Bifrost
     URL into the `provider` block inside the same JSON.
  4. **No adapter change needed.** Single `APPDATA` Windows lookup
     stays. Adapter is fully pass-through.

**Open questions surfaced**

- **Piggyback shape choice** for the JSON the gateway writes:
  (a) extend the existing `KILO_CONFIG_CONTENT` permission-mode
  JSON (cleaner, one env var); (b) write a separate
  `kilo.json` to project/user config (slower, no env-var soup).
  AO-internal decision; not Phase-2-blocking.
- **`KILO_CONFIG` path-override env var** is the AO_HOME-friendliness
  anchor for kilo (redirect data dir under `AO_HOME/kilo/`); flagged
  as a Phase-2 followup, not audited in this iteration.

**Verificatie / gates**

- Markdown / section structure verified by re-reading the file via
  `Edit` (write state tracked). No Go / TS code touched this
  round — research slice only. Gates deferred (no source files
  modified).

## Iteratie 11 — 2026-07-03 (Fase 2 Research: crush)

**Wat is geland**

- Per-adapter env-var audit continued: `crush` (Charmbracelet
  Crush, binary `crush`, npm `@charmland/crush`). Section appended
  to `.docs/research/opencode-env-audit.md` (file now 11 sections,
  ~1100 lines).
- Verified sources:
  - `charmbracelet/crush/main/README.md` — top-of-file
    "Multi-Model: choose from a wide range of LLMs or add your
    own via OpenAI- or Anthropic-compatible APIs" (line ~16) +
    the 25-row env-table of `_API_KEY` aliases (lines 183-199)
    + the Section "Configuration" / "MCPs" with shell-style
    `$VAR` / `${VAR:-default}` / `${VAR:?error}` expansion rules
    + the global config-file layers (`.crush.json` →
    `crush.json` → `$HOME/.config/crush/crush.json`).
  - `internal/cmd/root.go` — lines 54-61 enumerate the actual
    CLI flags `--cwd/-c`, `--data-dir/-D`, `--debug/-d`,
    `--host/-H`, `--yolo/-y`, `--session/-s`, `--continue/-C`,
    `--help/-h`. AO uses three: `--cwd`, `--yolo`, `--session`
    (matches what `crush.go:79-101` constructs).
  - `internal/config/load.go` — **lines 168-193 confirm the
    `PushPopCrushEnv()` pattern**: any `CRUSH_<X>` env var is
    lifted into `<X>` for the duration of
    `configureProviders()`, then restored on exit. This is
    purpose-built for routing hooks like Bifrost — and was
    **not visible from any other audit so far**. Lines
    1037-1192 confirm additionally-published env hooks:
    `CRUSH_GLOBAL_CONFIG`, `CRUSH_GLOBAL_DATA`,
    `CRUSH_CACHE_DIR`, `CRUSH_SKILLS_DIR`.
  - `internal/agent/hyper/provider.go` — lines 31-48 confirm
    `HYPER_URL` env override (defaults to
    `https://hyper.charm.land`); this is the only
    per-provider `*_BASE_URL` env knob exposed by Crush proper.
  - `internal/env/env.go` — 53-line wrapper over `os.Getenv`;
    no provider-related base-URL knobs (cleanly verified).
- Direct grep on `crush.go`:
  `grep -nE 'os\.(Getenv|Setenv|LookupEnv)' ` returned one
  match at line 177: `os.Getenv("APPDATA")` for the
  Windows binary-resolution fallback only. Adapter is
  pass-through.
- `TODO.md` Phase-2 Research sub-list ticked:

  ```
  - [x] crush — audit in same file "crush" section; sourced
        from charmbracelet/crush/main/README.md (env-var table
        direct-fetched, 2026-07-03) + internal/cmd/root.go
        flags + internal/config/load.go (PushPopCrushEnv pattern,
        direct-fetched, 2026-07-03) +
        internal/agent/hyper/provider.go (HYPER_URL env override,
        direct-fetched, 2026-07-03) + internal/env/env.go
        (verified 2026-07-03). Clean Bifrost route via
        PushPopCrushEnv: any CRUSH_<VAR> env var is lifted into
        the underlying <VAR> for provider config resolution then
        restored (line 168-193 of load.go) — purpose-built for
        routing-hook injection. README lists 25 *_API_KEY direct
        aliases; only HYPER_URL for non-Hyper base-URL is unusual
        (per-provider base_url in crush.json with shell-
        expansion is the only other path). Adapter: single APPDATA
        Windows-only lookup (pass-through).
  ```

**Headline finding**

- Crush is **the third clean Bifrost route in the queue**
  (after claude-code and continueagent) and the **first to
  expose an explicit in-process env-rewrite hook**: the
  `PushPopCrushEnv()` machinery in `internal/config/load.go`
  lifted to the public CLI surface. Practical for Bifrost:
  1. Set `CRUSH_OPENAI_API_KEY=<bifrost-token>` in `cfg.Env`
     at spawn — the CLI momentarily rewrites
     `OPENAI_API_KEY` and restores on exit.
  2. URL routing flows through the JSON `base_url` field
     with shell-expansion (`"base_url": "${AO_BIFROST_BASE:-…}"`).
     The user's existing `crush.json` is preserved if AO uses
     a merge rather than rewrite.
- **No adapter change needed**: the AO crush adapter is
  already a clean pass-through (single `APPDATA` Windows
  lookup, no API key, no base URL touches).
- Binary-name trivia (same shape as cursor): Crush has no
  legacy-alias concern — `crush` is the only binary name;
  already what AO's adapter hardcodes.

**Open questions surfaced (NOT resolved — flagged for Bifrost PR)**

- **Where the Bifrost entry lives in `crush.json`**: project-layer
  `.crush.json` or user-layer `~/.config/crush/crush.json`?
  Mirror of the same codex / continueagent preserve-vs-rewrite
  shape. Decision flagged, not made.
- **Exact env-var selection the gateway writer should emit**:
  `CRUSH_OPENAI_API_KEY` for the token is uncontroversial;
  for the base URL, the cleanest path is via JSON
  shell-expansion (`"${AO_BIFROST_BASE:-…}"`), not by an
  extra `CRUSH_*_BASE_URL` knob (which doesn't exist).
- **`CRUSH_GLOBAL_CONFIG` / `CRUSH_GLOBAL_DATA`** are env
  overrides that could in principle redirect Crush's data
  dir under `AO_HOME` for clean Phase-1 followup. Surface
  flagged; not Phase-2 scoped.

## Iteratie 10 — 2026-07-03 (Fase 2 Research: cursor)

**Wat is geland**

- Per-adapter env-var audit continued: `cursor` (Cursor CLI,
  binary `agent` primary / `cursor-agent` legacy alias). Section
  appended to `.docs/research/opencode-env-audit.md` (file now 10
  sections, ~880 lines).
- Verified sources:
  - `https://cursor.com/docs/cli/overview` — Playwright-rendered
    (2026-07-03). CLI flags actually accepted by the binary:
    `--print` / `-p`, `--model`, `--output-format`, `--mode`
    (`agent`/`plan`/`ask`), `--sandbox` (`enabled`/`disabled`),
    `--trust`, `--continue`, `--resume="chat-id"`, plus interactive
    subcommands `agent ls` and `agent resume`. **Zero env-var
    references** on this page.
  - `https://cursor.com/install` — direct-fetched shell script
    (2026-07-03). Lines 130-131: `install.sh` symlinks both
    `~/.local/bin/agent` (primary) and `~/.local/bin/cursor-agent`
    (legacy alias) to the real binary
    `~/.local/share/cursor-agent/versions/<ver>/cursor-agent`.
  - Direct grep of `backend/internal/adapters/agent/cursor/cursor.go`
    for `os.(Getenv|Setenv|LookupEnv)` → **zero matches**. Cursor
    adapter is a clean pass-through.
- Cursor CLI **public env-var search** (negative finding):
  - `https://cursor.com/docs/agent/environments` → 404.
  - `https://cursor.com/docs/cli/configuration` → 404.
  - `https://cursor.com/docs/cli/api` → 404.
  - `https://cursor.com/docs/cli/environment-variables` → 404.
  - `https://cursor.com/docs/cli/reference` → 404.
  - Live docs search index (`Cmd-K` on `/docs/cli/overview`) for
    query `CURSOR_API_KEY` → **"No results found"** (cmdk-rendered
    client-side, so 0 hits is a real negative).
- Conclusion: **the rumoured `CURSOR_API_KEY`,
  `CURSOR_API_BASE_URL`, `OPENAI_API_KEY` exception, and
  `CURSOR_API_<MODEL_VAR>` env knobs do not exist** in any
  reachable current page on cursor.com/docs/*. The claim is
  either fabricated or retired from older docs. Do not wire
  Bifrost gateway routing through them.
- `TODO.md` Phase-2 Research sub-list ticked:

  ```
  - [x] cursor — audit in same file "cursor" section; sourced
        from https://cursor.com/docs/cli/overview (Playwright,
        2026-07-03) + https://cursor.com/install (direct-fetched
        shell script, 2026-07-03). Negative finding: no
        CURSOR_API_KEY / CURSOR_API_BASE_URL / OPENAI_API_KEY
        / CURSOR_API_<MODEL_VAR> env knobs in any reachable
        current doc page (every probable URL is 404; docs
        search index 0 hits). Cursor is closed-source OAuth-
        bound to its own billing, no public base-URL override —
        no v1 Bifrost gateway route. Adapter: zero env-touches
        (pass-through). Binary: agent (primary) and cursor-agent
        (legacy symlink alias) both valid; AO's hardcoded
        cursor-agent still works indefinitely.
  ```

**Headline finding**

- Cursor is the **first negative-Bifrost audit in the queue**:
  no public env-var hook exists today that would let AO redirect
  Cursor CLI traffic through the Bifrost gateway. AO has three
  options, only the first is recommended for v1:
  1. **Accept the gap**: let Cursor talk to `api.cursor.com`
     via its built-in OAuth login. Zero code change in the
     cursor adapter.
  2. Config-file injection (Cursor is closed-source, we have
     no authoritative list of fields it reads — guessing
     territory, skip for v1).
  3. Network-level proxy (infra-layer change, not the shape
     the current Bifrost scaffold PR is scoped to).
- **Adapter changes needed for Bifrost: none.** cursor.go is
  already a clean pass-through. Future env needs (if any) flow
  through `cfg.Env` at spawn time, not adapter edits.
- Binary-name trivia worth knowing: `cursor-agent` (AO's
  hardcoded) is the **legacy alias** that the install script
  still creates alongside `agent`. Both names validate to the
  same executable. No urgent change; cosmetic refactor option
  for a follow-up.

**Open questions surfaced (NOT resolved — flagged for Bifrost PR)**

- **Treat `cursor` as out-of-scope for Bifrost v1** until Cursor
  ships a `--base-url`-style flag — there is no point writing
  speculative config-file injection against a closed-source
  binary whose on-disk layout we cannot reverse-engineer
  confidently. Document the gap in the gateway PR's adapter
  matrix; revisit only on a Cursor docs change.
- **Binary alias drift**: if AO ever wants to look up the
  binary directly (e.g., version detection), it needs to look
  at `~/.local/share/cursor-agent/versions/<ver>/`, not just
  PATH. Cosmetic; not audit-priority.

## Iteratie 9 — 2026-07-03 (Fase 2 Research: continueagent)

**Wat is geland**

- Per-adapter env-var audit continued: `continueagent` (Continue CLI,
  binary `cn`, npm `@continuedev/cli`). Section appended to
  `.docs/research/opencode-env-audit.md` (file now 9 sections).
- Verified sources:
  - `docs.continue.dev/guides/cli` — CLI install/usage.
  - `docs.continue.dev/reference` — `config.yaml` schema; per-model
    `apiBase` confirmed as a top-level field of every model entry.
  - `docs.continue.dev/reference/yaml-migration` — Continue Global
    Directory is `~/.continue` (Mac/Linux), `%USERPROFILE%\.continue`
    (Windows).
  - Direct fetch of `extensions/cli/src/env.ts` — only two env vars
    read at CLI bootstrap: `CONTINUE_API_BASE`,
    `CONTINUE_GLOBAL_DIR`. Both named explicitly.
  - Direct fetch of `extensions/cli/src/auth/authEnv.ts` — auth.json
    lives at `path.join(env.continueHome, "auth.json")`, populated
    interactively via `/login`.
  - `extensions/cli/scripts/install.sh` — confirms package
    `@continuedev/cli`, binary `cn`, Node ≥ 20.20.1.
- Confirmed adapter (`continueagent.go:187`) is one-env-touch
  pass-through: only `os.Getenv("APPDATA")` for Windows path
  resolution.
- `TODO.md` Phase-2 Research sub-list ticked:

  ```
  - [x] continueagent — audit in same file
        "continueagent" section; sourced from
        docs.continue.dev/guides/cli + /reference +
        /reference/yaml-migration +
        raw.githubusercontent.com/continuedev/continue/main/extensions/cli/src/env.ts
        (verified 2026-07-02). Clean Bifrost route via per-model
        apiBase in ~/.continue/config.yaml; CLI also reads
        CONTINUE_API_BASE (Hub only) and CONTINUE_GLOBAL_DIR.
        Adapter: only APPDATA Windows lookup (pass-through).
  ```

**Headline finding**

- Continue is **the cleanest gateway-fetchable adapter in the audit
  queue so far**. Every per-model entry in `config.yaml` exposes
  `apiBase` (provider-agnostic override of the per-model endpoint) and
  `apiKey` (with `${{ secrets.NAME }}` placeholder syntax).
- AO can route every Continue session through Bifrost by writing
  one entry into `~/.continue/config.yaml`: a single model with
  `provider: openai` (since Bifrost speaks OpenAI-compat),
  `apiBase: http://127.0.0.1:<bifrost-port>/v1`, and a
  `${{ secrets.AO_BIFROST_TOKEN }}` placeholder.
- **No adapter change needed**: the AO continueagent adapter is
  already a clean pass-through. AO's gateway story lives in the
  future `internal/providers/` module's config-writer, not in the
  adapter.
- Negative findings:
  - Continue does not honor `OPENAI_API_BASE` /
    `ANTHROPIC_BASE_URL` / etc. directly from env for per-model
    traffic; the `apiBase:` config field replaces them.
  - There's no `CONTINUE_API_KEY` style global env var — auth
    tokens come from `config.yaml`'s `apiKey` (with secrets
    resolution) or `auth.json` (interactive `/login`).

**Open questions surfaced (NOT resolved — flagged for Bifrost PR)**

- **Preserve-vs-rewrite for `~/.continue/config.yaml`**: AO may
  need to merge a single Bifrost entry into the user's existing
  Continue config (preserving their models / MCP / rules / prompts)
  instead of overwriting. Same shape of question we hit on the
  `codex` audit (project vs. user config layer). Decision flagged,
  not made.
- **Where the Bifrost token lives**: `config.yaml` `apiKey:` literal
  vs. Continue's secrets file (dotenv-style format; documented in
  the reference). Literal path leaks the token via `cat` to anyone
  with read on `$HOME`; secrets-file path is cleaner. Decision
  flagged, not made.

**Wat is geblokkeerd en op welke beslissing**

- Geen DECISIONS.md blockers geraakt (A, B, C nog open user-kant).
  Wel twee audit-internal blockers geflagd (config-preserve /
  token-storage) die aan de Bifrost-PR moeten worden overgelaten.

**Voorgestelde volgende iteratie (in volgorde)**

1. `cursor` — likely OAuth-bound commercial adapter like `copilot`;
   expecting another negative finding on Bifrost routes. Useful to
   confirm pattern that closed CLIs stay closed while OSS ones route
   freely.
2. `crush` — open-source, OpenAI-compat provider shape is plausible
   again (similar pattern to aider/codex).
3. Reassess after iteration 10 — if cursor is also a negative
   finding, switch to auditing the long-tail batch together
   (`agy`, `vibe`, `kimi`, `kiro`, `pi`, `qwen`, `grok`,
   `autohand`, `auggie`, `amp`, `devin`, `droid`, `goose`,
   `kilocode`) so each authoritative source citation is one WebFetch
   call and a 20-line section.

## Iteratie 8 — 2026-07-03 (Fase 2 Research: copilot)

**Wat is geland**

- **Phase 2 Research #1 — sixth slice, `copilot` audit, with
  verified source and a notable negative finding.** Picked
  next-highest-known CLI.
- Confirmed the AO `copilot` adapter wraps the **new**
  `copilot` CLI (npm `@github/copilot`), explicitly **not** the
  older `gh copilot` extension. Adapter grep: only the
  Windows-only `APPDATA` lookup (line 175); pass-through.
- Authoritative sources verified live (2026-07-02):
  - <https://github.com/github/copilot-cli/blob/main/README.md>
    (raw, fetched 2026-07-02) — explicit auth-via-env:
    `GH_TOKEN` (with `GITHUB_TOKEN` as alternate) are the only
    documented env inputs; otherwise `/login` interactive OAuth.
    Installation script honours `PREFIX` and `VERSION`.
  - <https://docs.github.com/copilot/concepts/agents/about-copilot-cli>
    — describes interactive + programmatic (`-p`/`--prompt`)
    modes, plan mode (Shift+Tab), Cloud + local sandboxes
    (`copilot --cloud`, `/sandbox enable`). Says nothing about a
    base-URL or provider-override knob.
- **Negative findings** (worth pinning as findings):
  - GitHub does **not** publish an env-var reference page for the
    new Copilot CLI:
    `docs.github.com/en/copilot/reference/copilot-cli-reference/cli-environment-variables`
    returns 404.
  - No `OPENAI_BASE_URL` analogue, no `COPILOT_BASE_URL` /
    `COPILOT_PROVIDER_URL` env var.
  - Model selection is **in-flow** via `/model` slash command or
    per-prompt — not inject-able via env var.
- **Implication for AO Bifrost gateway**: there is **no clean
  AO-side route through Bifrost for the new GitHub Copilot
  CLI**. The CLI is OAuth-tied to a GitHub account (or fine-grained
  PAT with `Copilot Requests` permission), hard-bound to GitHub's
  API endpoints, with model-selection entirely in-flow. Possible
  workarounds enumerated: PAT-on-the-wire (still routes via
  GitHub's API, NOT Bifrost — doesn't actually enable AO provider
  routing), slash-command injection via setting file (no
  published schema), or wrapping with a small shim CLI (out of
  scope for the adapter).
- Two open questions surfaced (audit footer):
  - Document the gap explicitly in Phase 2 `ao doctor` output
    (warn-not-fatal) so users don't think they're routed through
    Bifrost when they're routed through GitHub.
  - Why AO exposes `copilot` in the adapter registry at all if
    there's no gateway route — UX-policy decision flagged, not
    invented here.

**Wat is geblokkeerd en op welke beslissing**

- 17 remaining adapters same as before. None blocked by
  user-decisions.
- Same open questions A/B/C from DECISIONS.md remain pending.

**Voorgestelde volgende iteraties (in volgorde)**

1. `continueagent` next (open-source, full provider surface —
   best chance of finding a clean gateway knob among remaining).
2. `cursor` after (commercial product with bundled-provider
   shape; likely OAuth-bound similar to copilot but worth pinning).
3. `crush` follows (open-source, OpenAI-style provider list —
   expected to be similar to aiding/codex in pattern).
4. The lesser-known batch (`agy`, `vibe`, `kimi`, `kiro`, `pi`,
   `qwen`, `grok`, `autohand`, `auggie`, `amp`, `devin`, `droid`,
   `goose`, `kilocode`) deferred — many are likely commercial
   successors to copilot with similar OAuth-binding.

## Iteratie 7 — 2026-07-03 (Fase 2 Research: cline)

**Wat is geland**

- **Phase 2 Research #1 — fifth slice, `cline` audit, with
  verified source.** Picked over `copilot` because cline
  exposes a clear canonical gateway knob (CLI `--baseurl` on
  `cline auth`), whereas copilot is GitHub-OAuth-bound.
- Key context surfaced: cline is **multi-surface** (VS Code
  ext., JetBrains plugin, `cline` Go/Rust CLI binary, plus
  Claude-Code-subscription hand-off). All surfaces share the
  same provider list (Anthropic, OpenAI, Gemini, OpenRouter,
  AWS Bedrock, GCP Vertex, Cerebras, Groq, Ollama, LM Studio,
  any OpenAI-compatible endpoint), but config-knob placement
  varies.
- Authoritative sources verified live (2026-07-02):
  - <https://docs.cline.bot/getting-started/authorizing-with-cline> —
    three auth paths (Cline usage-billing, ClinePass, BYOK),
    provider list, CLI auth flow.
  - <https://docs.cline.bot/provider-config/anthropic> — BYOK
    Anthropic: key in UI; **"Custom Base URL" checkbox** for
    proxy/gateway overrides.
  - <https://docs.cline.bot/provider-config/openai> — same shape:
    BYOK OpenAI + optional "Base URL" UI field for proxy/gateway.
  - <https://github.com/cline/blob/main/apps/cli/README.md> (raw,
    fetched 2026-07-02) — the exact CLI runbook with the four
    command shapes:
    ```
    cline auth --provider anthropic \
      --apikey sk-... --modelid claude-sonnet-4-6
    cline auth --provider openai-native \
      --apikey sk-... --modelid gpt-5 \
      --baseurl https://api.example.com/v1
    cline -P openrouter -m google/gemini-3-pro -k sk-...
    cline -m anthropic/claude-opus-4-6
    ```
- Grep of `backend/internal/adapters/agent/cline/cline.go` for
  `CLINE_|ANTHROPIC_|OPENAI_API|OPENAI_BASE|os.Setenv|os.Getenv|
  Getenv\(|env`: only the Windows-only `APPDATA` lookup (line
  167) for shell-tool path resolution matches. Pure pass-through.
- Two viable AO integration routes documented:
  1. **CLI form**: `--baseurl` on `cline auth --provider X`, then
     plain `cline "..."` in session env. `--config <path>` flag
     lets AO pin auth storage under `$AO_HOME/cline/<project>/`.
  2. **Claude-Code-subscription hand-off**: the spawned `claude`
     binary reads `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`
     itself — same plumbing as the standalone `claudecode`
     adapter, no extra layer.
- Open questions surfaced (audit footer): where cline stores
  auth config when given `--baseurl`+`--apikey`, and that OAuth
  providers (`cline`, `openai-codex`, `oca`) deliberately
  bypass AO's gateway (no key on the wire) — flagged so it
  isn't a surprise in Phase 2 doctor output. Neither invented
  here.

**Wat is geblokkeerd en op welke beslissing**

- 18 remaining adapters same as before. None blocked by
  user-decisions.
- Same open questions A/B/C from DECISIONS.md remain pending.

**Voorgestelde volgende iteraties (in volgorde)**

1. `copilot` next (well-known, but mostly OAuth-tied; expected
   to surface a different shape — GitHub-CLI Auth-bound rather
   than env-var-bound).
2. Then `cursor` (similar profile; commercial product with
   bundled-provider model).
3. `continueagent` after that (open-source, full provider
   surface — likely the most knobs of any remaining).
4. The lesser-known batch (`agy`, `vibe`, `kimi`, `kiro`, `pi`,
   `qwen`, `grok`, `autohand`, `auggie`, `amp`) deferred until
   the established CLIs are mapped.

## Iteratie 6 — 2026-07-03 (Fase 2 Research: aider)

**Wat is geland**

- **Phase 2 Research #1 — fourth slice, `aider` audit, with
  verified source.** Picked as next-best-known CLI on the audit
  queue (per the iteratie-5 list of remaining high-yield targets).
- Authoritative sources surfaced and verified live (2026-07-02):
  - <https://aider.chat/docs/config.html> — Aider's three
    equivalent config surfaces (CLI > YAML > env > `.env`) and the
    `AIDER_<UPPER_SNAKE>` env-var convention auto-derived from
    kebab-case CLI flags (`--dark-mode` → `AIDER_DARK_MODE`).
  - <https://aider.chat/docs/config/api-keys.html> — how
    API keys flow: OpenAI/Anthropic have dedicated
    `--openai-api-key`/`--anthropic-api-key` CLI switches and
    `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` env vars; other
    providers use `--api-key provider=<key>` which sets the
    `<PROVIDER>_API_KEY` env var at the shell, plus matching
    `<PROVIDER>_API_KEY` in `.env` or YAML.
  - <https://aider.chat/docs/llms/openai-compat.html> — the exact
    recipe for OpenAI-compat endpoints (the gateway route):
    `OPENAI_API_BASE=<endpoint>`, `OPENAI_API_KEY=<key>`,
    `--model openai/<model-name>`.
- Grep of `backend/internal/adapters/agent/aider/aider.go` for
  `OPENAI_API_BASE|OPENAI_API_KEY|ANTHROPIC_API_KEY|AIDER_|os.Setenv|
  os.Getenv|env`: **zero matches**. The AO `aider` adapter is
  pure pass-through — it spawns the CLI with whatever env the
  project session already plumbs through. This is the cleanest
  audit result so far: routing aider through Bifrost needs nothing
  on the adapter side, AO just sets `OPENAI_API_BASE` +
  `OPENAI_API_KEY` in `project.Config.Env`.
- New audit section appended to
  `.docs/research/opencode-env-audit.md` (one audit file, four
  adapter sections — keeps TODO.md's pointer stable).
- `.docs/TODO.md` Phase 2 Research #1 progress sub-list ticked:
  `aider` `[ ] → [x]` with source citation inline.

**Wat is geblokkeerd en op welke beslissing**

- 19 remaining adapters same as last iteration. None are
  user-blocked; can still go.
- One open question surfaced in the audit footer: aider's
  Anthropic integration docs (as audited here) do not show a
  separate `ANTHROPIC_BASE_URL` knob (only `ANTHROPIC_API_KEY` /
  `--anthropic-api-key`). If users want Anthropic-direct gateway
  routing, AO either has to fall through to the OpenAI-compat
  path (forcing `--model openai/<custom>`) or wait for aider to
  expose a base-URL knob. Not invented here. Worth flagging in
  the Bifrost design discussion but not blocking this row.

**Voorgestelde volgende iteraties (in volgorde)**

1. `cline` next (high-yield: well-known provider knobs, similar
   to aider in pattern).
2. `copilot` after (slightly different shape: usually tied to a
   GitHub-account login rather than per-provider env keys).
3. The lesser-knowns (`agy`, `vibe`, `kimi`, `kiro`, `pi`, `qwen`,
   `grok`, `continueagent`, `autohand`, `auggie`, `amp`) as a
   later batch once the established CLIs are mapped.
4. Independent of audit progress, the cross-platform smoke
   matrix (Linux-only currently) remains queued as a low-risk
   effective improvement for a non-Research #1 iteration.

## Iteratie 5 — 2026-07-03 (Fase 2 Research: codex)

**Wat is geland**

- **Phase 2 Research #1 — third slice, `codex` audit, with verified
  source.** Codex was the highest-priority remaining adapter on the
  audit queue (well-known CLI with documented provider-overrides,
  picked over the lesser-knowns).
- Authoritative sources surfaced and verified live (2026-07-02):
  - <https://developers.openai.com/codex/auth> — login flows
    (`codex login --with-access-token` reads `CODEX_ACCESS_TOKEN`
    from stdin), `CODEX_CA_CERTIFICATE` env override (falls back to
    `SSL_CERT_FILE`), credential-store configuration
    (`cli_auth_credentials_store = "keyring"|"file"|"auto"`),
    custom-provider auth options
    (`requires_openai_auth` vs `env_key`).
  - <https://developers.openai.com/codex/config-basic> — config-file
    layers (`~/.codex/config.toml` + `.codex/config.toml` walking
    from project root down, only loaded for trusted projects),
    `model`, `approval_policy`, `sandbox_mode`, profile-and-system
    layers, `shell_environment_policy`, `[features]` toggle table.
  - <https://developers.openai.com/codex/config-advanced> — `[model_providers.<id>]`
    schema (`base_url`, `env_key`, `http_headers`,
    `env_http_headers`, `wire_api`, `query_params`,
    `auth.command/args/timeout_ms/refresh_interval_ms`), built-in
    provider overrides (`openai_base_url`, `chatgpt_base_url`), the
    **security call-out** that project-layer `config.toml` cannot
    redefine provider/host/notify/telemetry keys ("Codex ignores
    the following keys in project-local … and prints a startup
    warning when it sees them").
- Grep of `backend/internal/adapters/agent/codex/codex.go` for
  `OPENAI_BASE_URL|CODEX_|os.Setenv|os.Getenv|openai_base|chatgpt_base`:
  only the Windows-only `APPDATA` lookup (line 170) for shell-tool
  path resolution matches. **No** provider-level overrides from
  the AO side today.
- Key insight flagged in the audit: routing codex through Bifrost
  requires writing to **user-layer** `~/.codex/config.toml` (or a
  profile file there), because project-layer writes for the
  provider keys are silently ignored. That is one of the few
  adapters where AO cannot rely on the worktree alone; the
  eventual `internal/providers/` scaffold will need a user-config
  merge step that preserves any user pre-existing entries.
- New audit section appended to
  `.docs/research/opencode-env-audit.md` (one audit file, three
  adapter sections — keeps TODO.md's pointer stable).
- `.docs/TODO.md` Phase 2 Research #1 progress sub-list ticked:
  `codex` `[ ] → [x]` with source citation inline.

**Wat is geblokkeerd en op welke beslissing**

- 20 remaining adapters on the audit list (`aider` … `vibe`) each
  have their own CLI; none is user-blocked; can be tackled
  sequentially in upcoming iterations. Highest-yield next
  targets: `aider`, `cline`, `copilot` — all well-known provider
  knobs worth pinning to citations.
- Open question C (`AO_HOME` create-vs-error) and the
  cross-platform smoke matrix are still pending, but neither
  blocks the audit.
- A second-order question surfaced by the codex audit:
  when AO writes `~/.codex/config.toml` to apply a provider
  override, does it merge with the user's pre-existing entries
  (preserve unknown keys) or overwrite? Decision needed for the
  Bifrost scaffold, not for this row. Not invented here; written
  into the audit as an "open question" footer.

**Voorgestelde volgende iteraties (in volgorde)**

1. Continue with `aider` (audit-queue top-3 by expected yield).
2. `cline` and `copilot` in the same iteration if budget allows.
3. When the obvious/established adapters are done, the
   lesser-knowns (`agy`, `vibe`, `kimi`, `kiro`, `pi`, `qwen`,
   `grok`, `continueagent`) can be a batch.
4. Independent of audit progress, the cross-platform smoke
   matrix (Linux-only currently) is a low-risk effective
   improvement and could be folded into a non-Research #1
   iteration next.

## Iteratie 4 — 2026-07-03 (Fase 2 Research: claude-code)

**Wat is geland**

- **Phase 2 Research #1 — second slice, `claude-code` audit, with
  verified source.** The TODO.md claim "`ANTHROPIC_BASE_URL` /
  `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`, already confirmed" had
  no pinned citation; this iteration finds the authoritative docs URL
  and pins it.
- Authoritative sources surfaced and verified live (2026-07-02):
  - <https://code.claude.com/docs/en/env-vars> — canonical env-var
    table for Claude Code. Confirms the names and one-line semantics
    of `ANTHROPIC_API_KEY` (→ `x-api-key`),
    `ANTHROPIC_AUTH_TOKEN` (→ `Authorization: Bearer …`),
    `ANTHROPIC_BASE_URL` (gateway endpoint override),
    `ANTHROPIC_MODEL` (`/model` picker), `ANTHROPIC_CUSTOM_HEADERS`,
    plus cloud-provider-specific overrides (Bedrock/Vertex/Foundry —
    out of scope for Bifrost).
  - <https://code.claude.com/docs/en/llm-gateway-connect> — the
    explicit "roll out a gateway" recipe using
    `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (or `…_API_KEY`).
    This is the exact knob Bifrost wants to drive.
- Verified the URL
  (`docs.anthropic.com/en/docs/claude-code/environment-variables`)
  deprecated → 301-redirects to `code.claude.com/docs/en/env-vars`;
  no content lost in the move. `code.claude.com/docs/en/environment-variables`
  itself returns 404 (404 is the platform's "URL changed" signal —
  canonical id is `/env-vars`).
- Grep of `backend/internal/adapters/agent/claudecode/claudecode.go`
  for `ANTHROPIC_|os.Setenv|os.Getenv` returned only one hit: the
  Windows-only `APPDATA` lookup (line 360) for shell-tool path
  resolution. **No** provider-level env overrides come from the AO
  claudecode adapter today. So routing claudecode through Bifrost
  needs zero adapter-side code: simply inject the gateway URL +
  credential into the spawned session's environment at session-start,
  and Claude Code picks them up natively.
- New content appended to `.docs/research/opencode-env-audit.md` as
  the `claude-code` section (single audit file, two adapter
  sections — keeps TODO.md's pointer unchanged).
- `.docs/TODO.md` Phase 2 Research #1 progress sub-list ticked:
  `claude-code` `[ ] → [x]` with source citation inline.

**Wat is geblokkeerd en op welke beslissing**

- 21 remaining adapters (`aider` … `vibe`) on the audit list each
  have their own CLI; none is user-blocked yet (only research), so
  they can be tackled sequentially in upcoming iterations.
  Audit-start-time per adapter is small (~5–10 min each); room for
  2–4 per hour-loop budget.
- Open question C (`AO_HOME` create-vs-error) and the
  cross-platform smoke matrix are still pending from the previous
  iteration, but neither blocks Research #1.

**Voorgestelde volgende iteraties (in volgorde)**

1. Begin adapter audit #3: `codex` (most likely to have non-trivial
   `OPENAI_BASE_URL` prefix knobs).
2. Optionally batch `aider` and `cline` (both have well-known
   provider-override env vars worth pinning).
3. Skip `agy` / `vibe` / `kimi` until the obvious ones are done —
   those are least-likely-known and can be researched as their
   entries come up.
4. The Phase 2 Research #1 list will not block Phase 2 design; the
   audit can complete in parallel with the first scaffolding
   commit, since the first Bifrost driver only needs
   `ANTHROPIC_BASE_URL` (claudecode) and one opencode knob to land.

## Iteratie 3 — 2026-07-03 (Fase 2 Research: opencode)

**Wat is geland**

- **Phase 2 Research #1 — first slice of the per-adapter env var
  audit.** Started with `opencode` per TODO.md's explicit ordering
  ("start with `opencode`, Guardian-style pattern already used
  elsewhere on this host, then `claude-code`…").
- New file `.docs/research/opencode-env-audit.md` documents what
  opencode itself reads (per `opencode.ai/docs/config`):
    - `OPENCODE_MODEL` selects the model by id;
    - `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`,
      `OPENCODE_CONFIG_CONTENT`, `OPENCODE_TUI_CONFIG` configure
      where opencode reads its provider list;
    - **No** opencode-level base-URL env var exists (base URL is
      per-provider in the opencode config file);
    - API keys are per-provider via the config's `{env:VAR_NAME}`
      substitution.
- The AO `opencode` adapter (`backend/internal/adapters/agent/opencode/opencode.go`)
  passes **no** provider-related env vars today — it inherits whatever
  is in the spawned session's env. Implication: routing opencode
  through AO's Bifrost gateway means writing
  `OPENCODE_CONFIG_CONTENT` (or a config file) at session-spawn time.
- `.docs/TODO.md` Phase 2 Research #1 splitt off into a
  per-adapter-progress sub-list so the 23-adapter audit can be
  tracked adapter by adapter.
- Commit `21f1403c`; nothing in `backend/` changed, so no test gate
  ran (this is research-only).

**Wat is geblokkeerd en op welke beslissing**

- The other 22 adapters on the audit list are not blocker-blocked;
  they will be tackled in subsequent iterations. None requires user
  input to research; only the eventual Bifrost integration does,
  which is RFC 002 §3 / Decision 1 territory.
- Open question **A** (controlled env, Phase 3), **B** (web-GUI,
  Phase 5), and **C** (`AO_HOME` create-vs-error, Phase 1 follow-up)
  are still waiting on the user.

**Voorgestelde volgende iteraties (in volgorde)**

1. Continue Research #1 with `claude-code` verifieren (TODO says
   already confirmed — pin the source so the claim no longer rests
   on assertion).
2. Then a sequential run through the other 22 adapters — one or two
   per iteration, given the 1-hour budget. Adapters likely to be the
   most probing first: `codex`, `aider`, `cline`, `copilot` — each
   has its own CLI with documented provider-overrides worth pinning
   to a citation rather than recall.
3. Once the audit table is complete, lift it into a single
   `internal/providers/adapter_env.go` map (data, not code logic) so
   the Bifrost sidecar config generator can iterate without
   hard-coding per-adapter branches.

## Iteratie 2 — 2026-07-03 (Fase 1 sluit-deurtjes)

**Wat is geland**

- `backend/internal/config/config_test.go::TestLoadAOHome` gained two
  sub-cases pinning Windows-path behaviour:
    - `AO_HOME=C:\Users\me\state` → `RunFilePath =
      C:\Users\me\state/running.json` (backslashes in the input
      survive verbatim; `filepath.Join` only changes the appended
      `running.json` segment's separator to the host's).
    - `AO_HOME=C:/Users/me/state` → mixed-slash form is also accepted
      verbatim.
  Both pass on this Linux host. On Windows, the same code produces a
  fully backslash-joined path. Important: `defaultStateDir()` does NOT
  mutate the `AO_HOME` value — only the `Load()` step that joins
  `running.json` or `data` onto it touches the path, and `filepath.Join`
  is the right primitive for cross-platform composition.
  - commit `eeb8e793`; full backend `go test -race ./...` exit 0.
- `.docs/TODO.md`: tick the Windows-path-handling item; reference the
  test-by-test proof.
- `.docs/ROADMAP.md`: Phase 1 status box added, pointing at the
  CHANGELOG and naming open question C as the one residual item.
- Push to `origin` only (no force); 2 new commits pushed.

**Wat is geblokkeerd en op welke beslissing**

- Open question **C** in `DECISIONS.md` (`AO_HOME` missing → create vs.
  error): still waiting on the user. Is the only remaining "Phase 1
  follow-up" item.
- Open question **A** (controlled environment) and **B** (web-GUI
  surface) — not in Phase 1; will block Phases 3 and 5 respectively
  when we get there.

**Voorgestelde volgende iteraties (in volgorde)**

1. Resolve open question **C** with the user. The default the existing
   code accidentally encodes is "create on first write" (both
   `runfile.Write` and `ptyregistry.writeRaw` already `MkdirAll`).
   Choice is mostly about where to centralize the `MkdirAll` and what
   permissions — not a fork in the road, but still the user's call.
2. Begin Phase 2 (RFC 002, provider gateway) on the same branch. Per
   the loop's phase-order rule, Phase 1 is now mechanically done; the
   only blocker on Phase 2 is research (the per-adapter env-var audit
   listed first in its TODO section) plus the Bifrost distribution
   decision (also a user call).

## Iteratie 1 — 2026-07-02/03 (Fase 1: AO_HOME end-to-end)

**Wat is geland**

- `backend/internal/config/config.go::defaultStateDir()` honours `AO_HOME`
  first, falls back to `$HOME/.ao`. `AO_DATA_DIR` / `AO_RUN_FILE` keep
  winning — automatic, no extra code in `resolveRunFilePath` /
  `resolveDataDir`. Add `AO_HOME` row to the `Load()` doc comment.
  - commit `f9d60d58` — `TestLoadAOHome` 5/5 sub-cases PASS;
    `go test -race ./...` overall exit 0.
- `backend/internal/adapters/runtime/conpty/ptyregistry/registry.go`
  stops duplicating `os.UserHomeDir()`; new `aoHomeDir()` helper routes
  through `AO_HOME` first. Stale `ponytail:`-style comment removed.
  - commit `137c3052` — `TestRegistryFileAOHome` 3/3 sub-cases PASS;
    full `ptyregistry` suite stays green.
- Electron `app.setPath("userData", …)` now reads `AO_HOME` via a
  vitest-testable helper `resolveUserDataParent` in
  `frontend/src/shared/user-data.ts`. Confirmed `process.env` is
  populated synchronously, so no Electron env-loading-order issue at
  the `app.ready`-before call site.
  - commit `1885ddf8` — `resolveUserDataParent` 5/5 vitest cases PASS.
- `frontend/src/shared/telemetry.ts::defaultDataDir` adds the
  `AO_HOME` tier between `AO_DATA_DIR` (still wins) and the
  `$HOME/.ao/data` default.
  - commit `df3bb0b2` — 4 new vitest sub-cases PASS.
- `frontend/src/shared/daemon-discovery.ts::defaultRunFilePath` finally
  reads its `_env` parameter (renamed to `env`); precedence is now
  `AO_RUN_FILE` > `AO_HOME` > `$HOME/.ao/running.json`. Empty values
  treated as unset.
  - commit `874a49e0` — 4 new vitest sub-cases PASS, file total 20/20.
- `AGENTS.md` "All app state lives under `~/.ao` only" hard rule
  rewritten to mention `AO_HOME` (with the additive/empty-as-unset
  semantics); `cli.mdx` env-var table gets an `AO_HOME` row plus a
  reworded `AO_DATA_DIR` row; `README.md` env-var table gains the
  `AO_HOME` row.
  - commits `aab7b7b4`, `71dcf41b`.
- Docs housekeeping: `.docs/TODO.md` ticks everything that landed,
  leaves open items explicitly unchecked with the right blocker
  named. `.docs/DECISIONS.md` gains open question C (AO_HOME missing
  → create vs. error).

**Build / test gates run this iteration (summary)**

- Backend: `go build ./...` OK; `go test -race ./...` exit 0 (all
  packages green; integration 22.6s, sqlite/store 76.2s, project 50.3s,
  everything else fence-post).
- Frontend: `npm run typecheck` exit 0; `npx vitest run src/shared/`
  7 files / 89 tests PASS (`user-data 5`, `telemetry 7`,
  `daemon-discovery 20`, plus pre-existing files).

**Wat is geblokkeerd en op welke beslissing**

- `Cross-platform smoke: AO_HOME override exercised on Linux, macOS,
  Windows (CI matrix or manual)` — remaining Phase 1 TODO item; this
  iteration is Linux-only. Adding the CI matrix needs a follow-up. RFC
  001 does not name a Decision that blocks this; it's a "do it" item,
  not a fork in the road.
- `Decide: does AO create AO_HOME if it doesn't exist yet, or error?`
  — explicitly surfaced in `.docs/DECISIONS.md` as new open question
  **C**. RFC 001 §"Decision" is silent on this; TODO.md has long had
  it as a "Decide:" item. Will block any code path that writes under
  `$AO_HOME` for the first time (runfile.Write already does `MkdirAll`;
  ptyregistry.writeRaw already does `MkdirAll`; the question is whether
  to centralise that and at what permissions). NOT invented here.

**Voorgestelde volgende iteraties (in volgorde)**

1. Resolve open question **C** with the user (create-on-missing yes/no
   and the perms). Cheap to slot in; Phase 1 follow-up before Phase 2.
2. Add the cross-platform CI matrix for the new AO_HOME tests so the
   macOS / Windows smoke is provably covered (in-repo CI workflow edit;
   one Linux box can run `GOOS=darwin go test ./internal/config` and
   `GOOS=windows` already, no real CI round trip required for this).
3. Begin Phase 2 — Provider gateway (RFC 002) on the same branch.
   Open questions A and B stay explicitly blocked; the per-adapter env
   var audit is the natural starting point and does not need either A
   or B.
