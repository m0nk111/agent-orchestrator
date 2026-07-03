# Per-adapter env var audit (Phase 2 research)

This file documents what each Phase-2-relevant adapter's underlying CLI
actually reads for **provider base URL**, **API key**, **model override**.

Goal: feed `internal/providers/` (Bifrost sidecar) with the right env-var
set per adapter so AO can route every adapter through one Bifrost
endpoint without per-adapter code branching.

> Audit order = TODO.md Phase 2 §"Research" hint order. Adapters that
> share an upstream CLI family are collapsed together. Adapters only
> relevant to later phases (reviewers, trackers, SCM) are skipped.

## Status

- [x] `opencode` — done below.
- [x] `claude-code` — done in next section.
- [x] `codex` — done further down.
- [x] `aider` — done further down still.
- [x] `cline` — done in this file's "cline" section.
- [ ] `amp`, `auggie`, `autohand`, `continueagent`, `copilot`, `crush`, `cursor`, `devin`, `droid`, `goose`, `grok`, `kilocode`, `kimi`, `kiro`, `pi`, `qwen`, `agy`, `vibe` — to do in follow-up iterations.

## `opencode` (sst/opencode)

Source: `backend/internal/adapters/agent/opencode/opencode.go`. The
adapter passes no env vars to the spawned CLI today (only `APPDATA` on
Windows for path resolution, and that is not provider-related).

What opencode itself reads, per <https://opencode.ai/docs/config>:

| Variable                  | Purpose                                                          |
|---------------------------|------------------------------------------------------------------|
| `OPENCODE_CONFIG`         | custom config file path                                          |
| `OPENCODE_CONFIG_DIR`     | custom config directory                                          |
| `OPENCODE_CONFIG_CONTENT` | inline YAML config                                               |
| `OPENCODE_TUI_CONFIG`     | custom TUI-only config                                           |
| `OPENCODE_MODEL`          | selected model id (e.g. `anthropic/claude-sonnet-4-5`)           |

- **Base URL**: there is **no** opencode-level base-URL env var. Base URL
  is configured per-provider inside the opencode config (`provider`
  blocks under `provider.<id>.api`), which the config-substitution
  syntax (`{env:VAR}`) can pull from env.
- **API key**: also per-provider via `apiKey: "{env:VARIABLE_NAME}"`.
  Common provider env vars the opencode docs use in examples:
  - `ANTHROPIC_API_KEY` (Anthropic provider)
  - Variety of `*_API_KEY` vars per OpenAI-compatible provider

### Implication for AO provider gateway

Routing opencode through Bifrost via AO requires either:

1. Writing `opencode.json` into the worktree's `.opencode/` directory
   (or `~/.config/opencode/`) with a provider record pointing at the
   Bifrost endpoint. AO already writes a plugin file at `hooks.go`-time
   so this slot is plausible.
2. Passing `OPENCODE_CONFIG_CONTENT` as a generated YAML blob into the
   session env. Avoids touching per-project file layout.
3. Passing `OPENCODE_MODEL` to select the model by id only — relies on
   the provider config being already non-provider-AO-managed (e.g.
   installed by the user, or written via mechanism #1 once).

Option (2) is the cleanest fit with AO's existing
`project.Config.Env` plumbing (it already flows to every spawned session
today, per RFC 002 §"Problem"), and does not require any new file format
on the opencode side. Mechanism #1 may still be needed for first-launch
default config seeding if opencode starts without any config file.

### Open question surfaced

`OPENCODE_MODEL` precedence versus in-config `model:` — TODO.md
implicitly asks "what wins?" — to be confirmed in a follow-up. The
docs page referenced how the model option uses `{env:OPENCODE_MODEL}`
substitution, which suggests the env var is a *substitution source*,
not a top-level override. Reading the opencode source (`src/env.ts`
grep) would settle this definitively.

---

## `claude-code` (anthropic Claude Code CLI)

Source: `backend/internal/adapters/agent/claudecode/claudecode.go`.
The adapter passes no provider env vars to the spawned CLI today
(only `APPDATA` on Windows for shell tool path resolution, line 360,
and that is not provider-related).

What Claude Code itself reads for **provider routing**, per the
authoritative Anthropic docs at
<https://code.claude.com/docs/en/env-vars> (page verified
2026-07-02; this is the official Anthropic-owned URL after the
deprecation of `docs.anthropic.com` redirects):

| Variable                     | Purpose                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `ANTHROPIC_API_KEY`          | API key sent as `x-api-key` header. Overrides a saved claude.ai login when set.                       |
| `ANTHROPIC_AUTH_TOKEN`       | Custom value for the `Authorization: Bearer …` header. Override gateway-style credentials.            |
| `ANTHROPIC_BASE_URL`         | Override the API endpoint to route through a proxy or gateway. **First-class LLM-gateway knob.**       |
| `ANTHROPIC_MODEL`            | Name of the model setting to use (drives `/model` picker; supports aliases and full model IDs).        |
| `ANTHROPIC_CUSTOM_HEADERS`   | Extra `Name: Value` headers per request (newline-separated; useful for routing/tenant tags).           |
| `ANTHROPIC_SMALL_FAST_MODEL` | **[DEPRECATED]** — name of Haiku-class model for background tasks. Use `ANTHROPIC_DEFAULT_HAIKU_MODEL`. |

The less-relevant-for-Bifrost env vars (`ANTHROPIC_BEDROCK_*`,
`ANTHROPIC_VERTEX_*`, `ANTHROPIC_FOUNDRY_*`, `ANTHROPIC_AWS_*`,
`ANTHROPIC_DEFAULT_<TIER>_MODEL*`) are documented in full at the
source URL but treat cloud-provider routing as out of scope for the
Bifrost gateway — those vars let Claude Code target a specific cloud
provider directly and are not the gateway knob.

The gateway-knob doc explicitly names `ANTHROPIC_BASE_URL` for
routing through an "LLM gateway" — see
<https://code.claude.com/docs/en/llm-gateway-connect#set-the-base-url-and-credential>:

```
export ANTHROPIC_BASE_URL=https://llm-gateway.example.com
export ANTHROPIC_AUTH_TOKEN=sk-gateway-key
```

### Implication for AO provider gateway

Routing claude-code through Bifrost via AO is a clean fit: AO already
plumbs `project.Config.Env` into the spawned session's environment
(see RFC 002 §"Problem"), and Claude Code reads `ANTHROPIC_BASE_URL`
plus one of `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` from
exactly that environment with no prior adapter-side interception or
file-write. Options:

1. **`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`**
   — the documented "roll out a gateway" mechanism. AO sets the
   gateway URL and a Bifrost-issued credential when a session is
   dispatched under a project whose AO provider config points at
   Bifrost. Works out-of-the-box, no file artifacts.
2. **`ANTHROPIC_CUSTOM_HEADERS`** — adds per-request tags (e.g.
   tenant, project) that the gateway can route on. Pure additive
   layer; valid without #1.
3. **`ANTHROPIC_MODEL`** — picks a model on the gateway. Useful
   when the AO-side preset only wants to constrain model, not
   provider.

The claudecode adapter needs no code changes for the gateway path:
its env block at session spawn is the single integration point.

### Caveats called out by the docs

- `ANTHROPIC_BASE_URL` pointing at a non-Anthropic host disables
  Remote Control (since v2.1.196) and (by default) MCP tool search.
  For an org that wants both, the docs recommend
  `ENABLE_TOOL_SEARCH=true` plus the gateway forwarding
  `tool_reference` blocks; this is the gateway operator's concern,
  not AO's, but worth flagging when gateway docs land.
- `ANTHROPIC_API_KEY` overrides the subscription login but
  non-interactively; in interactive mode the user is prompted
  once to approve. AO must therefore make the key set visible at
  session start (today's `[O] Open in browser` notification when
  detecting env-var-driven mode would be a natural fit).

### Open question surfaced

None specific to the gateway mechanics. The TODO.md "AO provider
config → Claude Code env mapping" item can rely on
`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` as the canonical
mapping without inventing new knobs; the question is purely how
those vars get populated from Bifrost's perspective, which is its
own overscope.

---

## `codex` (OpenAI Codex CLI)

Source: `backend/internal/adapters/agent/codex/codex.go`. The
adapter passes no provider env vars to the spawned CLI today (only
`APPDATA` on Windows for shell-tool path resolution, line 170 — not
provider-related).

What Codex itself reads for **provider routing**, per the official
OpenAI docs (verified 2026-07-02):

| Var / key                 | Where                                               | Purpose                                                  |
|---------------------------|-----------------------------------------------------|----------------------------------------------------------|
| `CODEX_HOME`              | env                                                 | Root dir for local state. Defaults to `~/.codex`.         |
| `CODEX_ACCESS_TOKEN`      | env                                                 | Pre-issued ChatGPT subscription access token (read from stdin only; one-shot at `codex login --with-access-token`). |
| `CODEX_CA_CERTIFICATE`    | env                                                 | PEM bundle of corporate root CA(s) for HTTPS / WSS. Falls back to `SSL_CERT_FILE` when unset. |
| `openai_base_url`         | `~/.codex/config.toml` (or profile, system)         | Overrides base URL for the built-in `openai` provider only. Does **not** apply to Bedrock or custom providers. |
| `chatgpt_base_url`        | `~/.codex/config.toml` (or profile, system)         | Similar role for the built-in `chatgpt` provider.          |
| `model_provider`          | `config.toml`                                       | Selects active provider. Built-ins: `openai`, `ollama`, `lmstudio`, `amazon-bedrock`. Custom via `model_providers.<id>`. |
| `model`                   | `config.toml` + `--model` CLI flag                  | Default model id (e.g. `"gpt-5.5"`).                       |
| `[model_providers.<id>]`  | `config.toml`                                       | Defines a custom provider with `base_url`, `env_key`, `http_headers`, `env_http_headers`, `wire_api`, `query_params`, optional `auth.command`. |

Source URLs:

- <https://developers.openai.com/codex/auth> — login methods,
  `CODEX_ACCESS_TOKEN`, `CODEX_CA_CERTIFICATE`.
- <https://developers.openai.com/codex/config-basic> — config
  precedence, `model = "gpt-5.5"` default, `shell_environment_policy`.
- <https://developers.openai.com/codex/config-advanced> — `openai_base_url`,
  `chatgpt_base_url`, `[model_providers.<id>]` schema, env-key,
  http-headers, auth-command helper, Bedrock and Azure examples.

### Custom provider recipe (pin source)

From `config-advanced`, the canonical shape is:

```
[model_providers.proxy]
name = "OpenAI using LLM proxy"
base_url = "https://proxy.example.com/v1"
env_key = "OPENAI_API_KEY"
```

with optionals:

```
http_headers = { "X-Example-Header" = "example-value" }
env_http_headers = { "X-Example-Features" = "EXAMPLE_FEATURES" }
wire_api = "responses"     # or "chat"
auth.command = "/usr/local/bin/fetch-codex-token"
auth.args = ["--audience", "codex"]
auth.timeout_ms = 5000
auth.refresh_interval_ms = 300000
```

Setting `requires_openai_auth = true` switches off the
`env_key`-driven auth and uses the saved ChatGPT/API login
override instead.

### Security-relevant restrictions

From `config-advanced` verbatim:

> Project config files can't override settings that redirect
> credentials, alter host-owned app request metadata, change
> provider auth, select config profiles, or run machine-local
> notification/telemetry commands. Codex ignores the following
> keys in project-local `.codex/config.toml` and prints a startup
> warning when it sees them: `openai_base_url`, `chatgpt_base_url`,
> `apps_mcp_product_sku`, `model_provider`, `model_providers`,
> `notify`, `profile`, `profiles`,
> `experimental_realtime_ws_base_url`, and `otel`. Set provider,
> notification, and telemetry keys in your user-level
> `~/.codex/config.toml`.

**Implication for AO Bifrost routing**: an `.codex/config.toml`
written into the worktree's project layer is **silently ignored**
when routing is involved. AO must write the file under
`$CODEX_HOME` (or `~/.codex/`) — user level — to apply a provider
override. This is one of the few CLI families where the AO side
has to write a file outside the project, not just inject env.

### Implication for AO provider gateway

Three viable options, all assuming the project layer is respected:

1. **Write `~/.codex/config.toml`** with a `[model_providers.bifrost]`
   block plus `model_provider = "bifrost"` and `model = "<chosen>"`
   before spawning Codex, per project. File-write location is
   user-level on purpose. Requires preserving any user pre-existing
   `config.toml` content (don't overwrite wholesale).
2. **Apply per-session overlay via `-c`/`--config` flags**: Codex
   accepts dot-notation overrides on the CLI
   (`codex --config model_provider='"bifrost"'`). Avoids touching
   disk, but multiple flags per command-line get unwieldy when
   several `model_providers.*` keys move together.
3. **Write a profile file** (`~/.codex/<proj-slug>.config.toml`)
   under `CODEX_HOME` and invoke
   `codex --profile <proj-slug>`. Same caveats as the user-config
   write; the profile mechanism is explicitly built for "share the
   base, only override selected values".

`CODEX_HOME` should be set to `$AO_HOME/codex` if AO wants its own
scratch `~/.codex`, otherwise Codex falls back to the OS-level
`~/.codex` and could leak keys across projects. Worth raising in
the Bifrost design discussion but not directly relevant to this
audit (no provider-related env injection needed beyond what other
adapters get).

### Open questions surfaced

- **`shell_environment_policy` default behavior**: not yet audited
  for whether the spawned CLI inherits Bifrost's credential vars
  into the shell tool or is gated. If gated, the credentials have
  to land on the right side of that filter — a follow-up question
  for the gateway integration, not for this row.
- **`CODEX_HOME` AO subdir**: should `$AO_HOME` have a `codex/`
  subdir by default for per-project credential separation, or
  leave that to the eventual `internal/providers/` scaffold? Out
  of scope for adapter-row; flagged for the scaffold PR.

---

## `aider` (Aider-AI / aider-chat)

Source: `backend/internal/adapters/agent/aider/aider.go`. Grep for
`OPENAI_API_BASE|OPENAI_API_KEY|ANTHROPIC_API_KEY|AIDER_|os.Setenv|
os.Getenv|env` returned **no matches**: the AO `aider` adapter
passes no provider-related env vars to the spawned CLI today and
does not override anything in its environment. Plain pass-through.

What aider itself reads for **provider routing**, per the official
docs (verified 2026-07-02):

Aider uses three parallel configuration surfaces, equivalent by
name (per <https://aider.chat/docs/config.html>):

```
$ aider --dark-mode
# .aider.conf.yml: dark-mode: true
# .env / shell: export AIDER_DARK_MODE=true
```

| Config surface        | Location                                       | Notes                                                     |
|-----------------------|------------------------------------------------|-----------------------------------------------------------|
| CLI flags             | every option has a `--<kebab>` switch          | highest precedence                                        |
| YAML config           | `.aider.conf.yml` (repo root, or `~/.aider.conf.yml`) | one YAML doc; supports nested keys                       |
| Env vars              | `AIDER_<UPPER_SNAKE>` for any CLI option        | auto-derived from the option name                         |
| `.env` file           | standard dotenv-style entries                  | read like shell env vars                                  |

Source: <https://aider.chat/docs/config.html>.

### Provider keys (audit-relevant subset)

Per <https://aider.chat/docs/config/api-keys.html>:

| Variable                                                              | Purpose                                              |
|-----------------------------------------------------------------------|------------------------------------------------------|
| `OPENAI_API_KEY`                                                      | OpenAI key (also `--openai-api-key`)                 |
| `ANTHROPIC_API_KEY`                                                   | Anthropic key (also `--anthropic-api-key`)           |
| `OPENAI_API_BASE`                                                     | **Base URL for OpenAI-compat endpoints** (the gateway knob) |
| `GEMINI_API_KEY` / `OPENROUTER_API_KEY` / `DEEPSEEK_API_KEY` / …      | Per-provider env vars, name = `<PROVIDER>_API_KEY`.  |
| `--api-key provider=<key>` (CLI)                                      | Equivalent to setting `<PROVIDER>_API_KEY=<key>` in env. |

Per <https://aider.chat/docs/llms/openai-compat.html>, the exact
recipe for an OpenAI-compatible endpoint:

```
export OPENAI_API_BASE=<endpoint>
export OPENAI_API_KEY=<key>
aider --model openai/<model-name>
```

### YAML config specifics

Per <https://aider.chat/docs/config/aider_conf.html>, the YAML
accepts two API-key forms:

```
openai-api-key: <key>          # special-case for OpenAI
anthropic-api-key: <key>       # special-case for Anthropic
api-key:
  - gemini=foo                 # sets GEMINI_API_KEY=foo
  - openrouter=bar             # sets OPENROUTER_API_KEY=bar
```

### Implication for AO provider gateway

Routing aider through Bifrost is straightforward in two ways:

1. **OpenAI-compat path** (model `openai/<name>`): inject
   `OPENAI_API_BASE=<bifrost>` and `OPENAI_API_KEY=<bifrost-cred>`
   in the spawned env. Already in the session's
   `project.Config.Env`, no adapter code needed.
2. **Anthropic** (`--model sonnet` etc.): inject
   `ANTHROPIC_API_KEY=<bifrost-cred>` plus optionally
   `ANTHROPIC_BASE_URL` (aider's Anthropic path does **not** seem
   to expose a separate base-URL env on the docs pages audited
   here — the OpenAI-compat path is the generic gateway knob).
   Worth a follow-up if users need Anthropic-direct routing.

The three layered config surfaces (CLI > YAML > env > `.env`) mean
the AO side has to set vars at the env layer (which sits *above*
`.env` but *below* the YAML the user might already have in the
repo). Bash env-set wins over `.aider.conf.yml`-if-the-user-doesn't-
list-the-key, which is the common case.

### Open question surfaced

- **Anthropic-direct base URL knob**: the docs audited here
  don't show a separate `ANTHROPIC_BASE_URL` analogue for aider's
  Anthropic integration (the docs reference the
  `ANTHROPIC_API_KEY` env var and `--anthropic-api-key` CLI flag,
  but no base URL knob surfaces). For users who want to keep
  Anthropic routing on the gateway, AO would have to (a) fall
  through to OpenAI-compat mode by setting `--model openai/<custom>`
  plus `OPENAI_API_BASE`, or (b) wait for aider's Anthropic
  integration to expose a base URL knob. Not invented here;
  flagged for the Bifrost design discussion.

---

## `cline` (Cline Bot Inc., formerly "Claude Dev")

Source: `backend/internal/adapters/agent/cline/cline.go`. Grep for
`CLINE_|ANTHROPIC_|OPENAI_API|OPENAI_BASE|os.Setenv|os.Getenv|
Getenv\(|env` returned **only one match**: `os.Getenv("APPDATA")`
at line 167 (Windows-only shell-tool path resolution). The AO
`cline` adapter is otherwise pure pass-through — it does not
override or inject provider env vars itself.

What cline itself reads for **provider routing**, per the official
docs + Cline CLI README (verified 2026-07-02):

Cline has multiple surfaces that share an agent core but differ
in where config lives:

| Surface           | How the user configures provider                              |
|-------------------|---------------------------------------------------------------|
| VS Code ext.      | Settings-UI fields (`API Provider` dropdown, `API Key`, `Model`, optional `Base URL`). |
| JetBrains plugin  | Same Settings-UI shape as VS Code.                            |
| `cline` CLI       | CLI flags (`-P/--provider`, `-m/--model`, `-k/--key`, `--baseurl`, plus `cline auth --... --apikey --modelid --baseurl`). |
| Cline OAuth       | OAuth sign-in (no API key) — base URL is then locked to Cline's gateway, not Bifrost's. |
| Claude Code path  | Hands off to the `claude` CLI (subprocess), which honours `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` itself. |

Cline supports many providers: Anthropic, OpenAI, Google Gemini,
OpenRouter, AWS Bedrock, GCP Vertex, Cerebras, Groq, Ollama,
LM Studio, any OpenAI-compatible endpoint, plus the curated
"Cline (usage-billing)" + "ClinePass" tiers.

Source URLs:

- <https://docs.cline.bot/getting-started/authorizing-with-cline> —
  the three auth paths (Cline usage-billing, ClinePass, BYOK),
  provider list, and `--provider=user-key` per-cloud-provider
  dropdown.
- <https://docs.cline.bot/provider-config/anthropic> — BYOK
  Anthropic path; key in UI; **"Custom Base URL"** checkbox for
  proxy/gateway overrides. Notes the Claude-Code-subscription
  path picks up `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`
  from the spawned `claude` subprocess.
- <https://docs.cline.bot/provider-config/openai> — BYOK OpenAI
  path; key + optional **"Base URL"** field for proxy/gateway
  overrides.
- <https://github.com/cline/cline/blob/main/apps/cli/README.md> —
  CLI runbook. The exact shapes that matter for env-driven
  automation:

```
cline auth --provider anthropic --apikey sk-... --modelid claude-sonnet-4-6
cline auth --provider openai-native --apikey sk-... --modelid gpt-5 --baseurl https://api.example.com/v1
cline -P openrouter -m google/gemini-3-pro -k sk-... "Set up a storybook"
cline -m anthropic/claude-opus-4-6 "Explain string theory"
```

The CLI is a Go-Rust binary (`cline` npm package resolves the
correct platform binary via optional dependencies), so it's the
one shape where the AO side can land config from env-vars in the
spawned process without a UI round-trip.

### Implication for AO provider gateway

Two viable routes depending on which surface AO controls:

1. **CLI form** (the shape AO spawns today): pass provider/model
   + base URL + key via `cline auth --provider X --apikey
   <bifrost> --modelid <id> --baseurl <bifrost>` during setup,
   then plain `cline "..."` in session env. The auth-step is
   per-project once; the base URL persists in cline's saved auth
   config (location TBD by cline, but `--config <path>` lets
   AO pin it under `$AO_HOME/cline/<proj>`).
2. **Claude-Code subscription path** in cline: don't override a
   base-URL knob on cline itself; instead set
   `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` in the
   environment of the `claude` subprocess that cline spawns.
   Same plumbing as the standalone `claudecode` adapter — no
   extra layer.

For the byok-OpenAI-compat path (the gateway route), the CLI's
`--baseurl` flag on `cline auth --provider openai-native` is the
hook. For Anthropic direct, the Cline BYOK flow accepts the same
flag.

### Open question surfaced

- **Where cline stores its auth config** when given `--baseurl`
  + `--apikey` via `cline auth`. The CLI README references a
  `--config <path>` flag for "CLI home resolution", suggesting a
  YAML/JSON file lives there. If AO pins `--config
  $AO_HOME/cline/<project>/config`, Bifrost-base-URL can be
  re-set per-project cleanly, but the exact file format and
  merge semantics are not in the docs audited here — follow-up
  needed before scaffolding the `internal/providers/`
  sidecar-to-cline glue. Not invented here.
- **OAuth-managed providers (`cline`, `openai-codex`, `oca`)**
  bypass AO's Bifrost by design (no key on the wire). If a
  project uses one of these AO has no gateway knob. That's a
  deliberate trade-off — flagging so it's not a surprise in
  Phase 2 doctor output.


