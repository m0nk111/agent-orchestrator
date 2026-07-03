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
- [x] `copilot` — done in this file's "copilot" section.
- [ ] `amp`, `auggie`, `autohand`, `continueagent`, `crush`, `cursor`, `devin`, `droid`, `goose`, `grok`, `kilocode`, `kimi`, `kiro`, `pi`, `qwen`, `agy`, `vibe` — to do in follow-up iterations.

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

---

## `copilot` (GitHub Copilot CLI, npm `@github/copilot`)

Source: `backend/internal/adapters/agent/copilot/copilot.go`.
Grep for `os.Setenv|os.Getenv|Getenv\(` returned **one match**:
`os.Getenv("APPDATA")` at line 175 (Windows-only shell-tool
path resolution). The AO `copilot` adapter spawns the npm-shipped
`@github/copilot` CLI binary and lets it inherit the session
env unchanged.

> **Note on naming**: this adapter wraps the **new** `copilot`
> CLI published by GitHub as `@github/copilot` (npm installable
> under the executable name `copilot`), NOT the older `gh copilot`
> extension of the GitHub CLI. The adapter is explicit about this
> at `copilot.go:6`: "NOT the older `gh copilot`".

What GitHub Copilot CLI itself reads, per the official GitHub
docs + GitHub's `copilot-cli` repo (verified 2026-07-02):

| Variable          | Purpose                                                  |
|-------------------|----------------------------------------------------------|
| `GH_TOKEN`        | GitHub auth token (env-driven; `GITHUB_TOKEN` is the alternate). Auth is otherwise interactive via `/login` OAuth flow. |
| `GITHUB_TOKEN`    | Same auth role; `GH_TOKEN` wins per the README.          |
| No other documented env vars | GitHub does not publish an env-var reference page for this CLI (`docs.github.com/en/copilot/reference/copilot-cli-reference/cli-environment-variables` returns 404). Negative finding. |

Source URLs:

- <https://github.com/github/copilot-cli/blob/main/README.md>
  (raw, fetched 2026-07-02) — explicit statement that `GH_TOKEN`
  is read with `GITHUB_TOKEN` as alternate; auth otherwise via
  interactive `/login` slash command. Specifies that the
  installation script honours `PREFIX` and `VERSION`.
- <https://docs.github.com/copilot/concepts/agents/about-copilot-cli>
  — describes the two CLI surfaces (interactive, programmatic
  via `-p`/`--prompt`), modes (ask/execute + plan), Cloud + local
  sandboxes (`copilot --cloud`, `/sandbox enable`). Says nothing
  about a base-URL or provider-override knob — the CLI talks
  exclusively to GitHub's API, full stop.

### Negative findings (audit-relevant)

- **No `OPENAI_BASE_URL` analogue**: GitHub Copilot CLI is
  GitHub-API-bound. Provider switching is the language of the
  `--allow-tool` permission system and the `/model` slash
  command, neither of which is a Bifrost-style base-URL knob.
- **No `COPILOT_BASE_URL` or `COPILOT_PROVIDER_URL` env**: not
  documented anywhere in the verified source set. (Confirmed
  again by the explicit 404 on the GitHub-published env-var
  reference page.)
- **Model selection**: TODO.md says "model override env" — for
  copilot that maps to `"<provider>/<model-id>"`-style strings
  via `/model`, not env vars. AO has no way to inject a model id
  without writing a slash command into the prompt.

### Implication for AO provider gateway

The honest answer: **there is no clean AO-side route through
Bifrost for the new GitHub Copilot CLI**. The CLI is

1. **OAuth-tied to a GitHub account** (or a fine-grained PAT
   with `Copilot Requests` permission) — there's no per-key, no
   per-provider, no per-BaseURL knob.
2. **Hard-bound to GitHub's API endpoints** — no override path.
3. **Model selection is in-flow** via `/model` (interactive) or
   per-prompt — not via an env var that AO could inject.

Possible workarounds, each with caveats:

- **PAT-on-the-wire** scheme: AO sets `GH_TOKEN=<fine-grained-pat-with-copilot-requests>`
  in the session env. This still routes through GitHub's API, NOT
  Bifrost — so this only helps if "Bifrost" means "the same
  upstream endpoint that GH copilot already talks to" for audit
  purposes. **Doesn't actually enable AO provider routing.**
- **Slash-command injection via setting file**: along with the
  CLI's persistent settings (configurable per the README's
  experimental-flag persistence behaviour). The CLI doesn't
  expose a published schema for this in the audited docs, so AO
  would be reading the binary's settings file format.
- **Wrap with a small shim CLI** that proxies to `copilot` while
  injecting `/login` + `/provider …` slash commands. Non-trivial
  and out of scope for AO's adapter; an "eventually-maybe" item.

### Open question surfaced

- **Document the gap explicitly in Phase 2 doctor output**: a
  project's `provider = "copilot"` config has no Bifrost route,
  by virtue of the upstream tool's design. AO should surface
  this (probably as a non-fatal warning in `ao doctor`) rather
  than silently use Copilot's API while the user thinks they're
  routing through Bifrost. Not invented here; flag for the
  Bifrost doctor PR.
- **Why AO supports GitHub Copilot in the adapter registry at
  all if there's no gateway route**: out of scope for this
  audit. The audit notes the gap; whether AO should expose
  `copilot` as a router-aware provider or demote it to
  "explicit-mode only" is a UX policy decision. Flagged.

---

## `continueagent` (Continuedev CLI, binary `cn`, npm `@continuedev/cli`)

Source: `backend/internal/adapters/agent/continueagent/continueagent.go`.
Adapter ID is `"continue"` (Go package named `continueagent` because
`continue` is a Go reserved keyword). Grep for `os.Setenv|os.Getenv`
returned **one match**: `os.Getenv("APPDATA")` at line 187
(Windows-only shell-tool path resolution — pass-through).
No provider env vars set.

> Note on the adapter's link to the Claude Code hook path:
> `continueagent.go:8-15` documents that the Continue CLI natively
> reads Claude Code hook settings (`.claude/settings.json` /
> `.claude/settings.local.json`) and dispatches Claude-format hook
> events. AO reuses the `claudecode` hook installer and routes
> through the existing `ao hooks claude-code <evt>` dispatcher. This
> is the reason the adapter can be a pass-through on env vars: the
> hook-side configuration is fully owned by `claudecode`. Confirmed
> by reading the adapter header + `GetAgentHooks` (line 117-122).

What Continue's `cn` CLI itself reads, per Continue's own CLI docs
plus the `@continuedev/cli` source tree on `main` (verified
2026-07-02):

| Variable | Purpose | Source |
| -------- | ------- | ------ |
| `CONTINUE_GLOBAL_DIR` | Override the Continue global home (normally `~/.continue` on Mac/Linux, `%USERPROFILE%\.continue` on Windows). Read in `extensions/cli/src/env.ts`. | <https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/src/env.ts> |
| `CONTINUE_API_BASE` | Override the **Continue Hub** API base URL. Default: `https://api.continue.dev/`. This only affects the Hub traffic (agent publishing/fetching) the CLI uses; it does NOT affect per-model API traffic. Read in the same `env.ts`. | same as above |
| `dotenv` (no env var) | At startup `env.ts` calls `dotenv.config()` so a `.env` in cwd is loaded; this is not an env-var discovery mechanism but it does mean any of the upstream env vars Continue detects are also pullable via godotenv-loaded files. | <https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/src/env.ts> |
| `OPENAI_API_BASE` (and other upstream provider envs) for inner model adapters | NOT supplied by Continue — model traffic goes via `apiBase` in `config.yaml` at the per-model level (see below). | <https://docs.continue.dev/reference#models> |

Source URLs (all fetched 2026-07-02):

- <https://docs.continue.dev/guides/cli> — confirms CLI binary is `cn`,
  install is `curl … | bash`, config is `config.yaml` (same shape as
  the Continue IDE extension), `--config <path>` flag for selecting a
  config, verbose logs go to `~/.continue/logs/cn.log`, per-session
  permissions land in `~/.continue/permissions.yaml`.
- <https://docs.continue.dev/reference> — pinned the per-model schema.
  Models live under `models:` (each model has `provider`, `model`,
  `apiBase`, `apiKey`, `requestOptions`, `roles`, etc.). Critically:
  > `apiBase` — Can be used to override the default API base that is specified per model.
  Plus the form `- uses: anthropic/claude-sonnet-4-6` with `with:` block
  for `${{ secrets.ANTHROPIC_API_KEY }}` and an `override:` block for
  `defaultCompletionOptions`. **This is the cleanest gateway knob among
  every adapter audited so far** — `apiBase` is a first-class field on
  every model entry.
- <https://docs.continue.dev/reference/yaml-migration> — defines the
  Continue Global Directory as `~/.continue` (Mac/Linux), with
  `%USERPROFILE%\.continue` on Windows.
- <https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/src/env.ts>
  — direct fetch of `env.ts`. Confirms `CONTINUE_API_BASE` and
  `CONTINUE_GLOBAL_DIR` are the only two `process.env.*` lookups
  in the CLI's environment bootstrap. (Greppable: `process.env.`).
- <https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/src/auth/authEnv.ts>
  — direct fetch. Auth state lives at
  `path.join(env.continueHome, "auth.json")`, populated
  interactively via `/login` slash command.
- <https://raw.githubusercontent.com/continuedev/continue/main/extensions/cli/scripts/install.sh>
  — direct fetch (truncated). Header confirms `PACKAGE_NAME="@continuedev/cli"`,
  `CLI_COMMAND="cn"`, `REQUIRED_NODE_VERSION="20.20.1"`, install via
  fnm. (Full installer logic was truncated by the fetcher; the
  package name + binary name + required Node version are the
  authoritative install-shaped facts the audit needs.)

### Negative findings (audit-relevant)

- **No `OPENAI_BASE_URL` analogue per provider**: Continue does not
  honor `OPENAI_API_BASE` / `ANTHROPIC_BASE_URL` / etc. directly from
  environment for the per-model traffic. The replacement is the
  per-model `apiBase:` in `config.yaml`. So AO cannot inject a base
  URL via env-vars only — it has to write `~/.continue/config.yaml`.
- **Auth tokens come from config**: `auth.json` is the side-channel
  for `/login`-populated tokens. `config.yaml` is the source of
  truth for static `apiKey` (resolved via `${{ secrets.NAME }}`).
  There is no `CONTINUE_API_KEY` style env var that AO can set.

### Implication for AO provider gateway

**Continue is a clean Bifrost-routed provider.** Recommendation:

1. **Per-model gateway routing**: AO writes
   `~/.continue/config.yaml` with one model entry (the project's
   selected model/provider), setting:
   ```yaml
   name: Bifrost
   version: 1.0.0
   schema: v1
   models:
     - name: <project's chosen model>
       provider: openai   # Bifrost exposes OpenAI-compat
       model: <id>
       apiBase: http://127.0.0.1:<bifrost-port>/v1
       apiKey: ${{ secrets.AO_BIFROST_TOKEN }}
       roles: [chat, edit, apply, summarize]
   ```
   This routes every Continue session through Bifrost for that
   project's selection.
2. **`CONTINUE_API_BASE` for hub traffic**: less interesting — the
   Hub API only matters for `/login`, agent publish/fetch from
   Continue's marketplace. Continue CLI can be used without the
   Hub entirely; setting/updating `CONTINUE_API_BASE` is a Phase-3
   "shared modules" concern, not a Phase-2 provider decision.
3. **Auth + secrets resolution**: `config.yaml` supports
   `${{ secrets.X }}` placeholders (verified by direct reading of the
   reference example). AO can populate secrets either by writing
   them inline (e.g. `ANTHROPIC_API_KEY: <literal>`) or by
   relying on Continue's own secrets store — that's a write-preserve
   vs. rewrite decision to flag for the Bifrost scaffold (see open
   question below).
4. **Adapter changes**: **none needed**. The continueagent adapter
   is already a clean pass-through. AO's gateway story lives in
   the `internal/providers/` module's config-file writer, not the
   adapter. AO should NOT modify `continueagent.go` for Bifrost.

### Open question surfaced

- **What to do with the user's pre-existing `~/.continue/config.yaml`?**
  Mirror of the same question we hit on the codex audit: does AO
  preserve the user's existing models/rules/MCP entries and *merge*
  a Bifrost entry, or overwrite the whole file? The answer
  determines whether AO's gateway config-writer is replace-or-merge
  per project. Flagged for the Bifrost scaffold PR (RFC 002
  implementation), not invented here.
- **Where does the secret live?** `config.yaml`'s `${{ secrets.NAME }}`
  references a flat key. AO needs to decide: write the Bifrost
  token into Continue's secrets file (`~/.continue/secrets.yaml` or
  equivalent — confirmed the schema uses dotenv-style), or stuff it
  literally in the `apiKey:` field. The literal path is simpler but
  leaks the token into process-listing `cat` of the config file for
  anyone with read access to `$HOME`; the secrets file is cleaner.
  Decision flagged, not made.

## `cursor` (Cursor CLI, binary `agent` legacy alias `cursor-agent`)

Source adapter:
`backend/internal/adapters/agent/cursor/cursor.go` (242 lines, package
`cursor`, adapter ID `"cursor"`).

### Adapter self-description (verbatim from source)

> "Package cursor implements the Cursor CLI agent adapter: launching new
> sessions, resuming hook-tracked sessions, installing workspace-local
> hooks, and reading hook-derived session info.
>
> AO-managed sessions derive native session identity and display
> metadata from Cursor hooks instead of transcript/cache scans. The
> driven binary is `cursor-agent` (not the `cursor` editor binary)."
> — `cursor.go:1-7`

Launch argv (from inspection of preflight / launch paths):

```
cursor-agent -p --output-format stream-json [--trust]
```

Restore argv:

```
cursor-agent -p --output-format stream-json --trust --resume <id>
```

Permission flags (verified by reading the mouse-flags branch):

| AgentOps permission | Cursor flag |
|---|---|
| `Default`           | *(no flag — defer to `.cursor/cli.json` permissions)* |
| `AcceptEdits`       | *(no flag)* |
| `BypassPermissions` | `--yolo` |
| `Auto`              | `--force` |

Binary resolution (per `cursor.go`):

1. `$PATH` lookup
2. `/usr/local/bin/cursor-agent`
3. `/opt/homebrew/bin/cursor-agent`
4. `~/.local/bin/cursor-agent`

### Env-var surface — primary findings

The adapter itself **touches zero environment variables**. Direct grep
confirms this:

```bash
$ grep -nE 'os\.(Getenv|Setenv|LookupEnv)' \
    backend/internal/adapters/agent/cursor/cursor.go
# (no matches; exit 1)
```

The adapter reads **only** its own CLI flags and Cursor's
on-disk config files (`.cursor/cli.json`, `.cursor/rules`, etc.,
plus a workspace `AGENTS.md` / `CLAUDE.md`). Auth is supplied by
Cursor's own OAuth/device-code login; the upstream binary
`agent` ships its credentials through its built-in login flow, not
through env.

### Cursor CLI env-var surface — official doc search

Audit attempted to verify the rumoured `CURSOR_API_KEY`,
`CURSOR_API_BASE_URL`, `OPENAI_API_KEY`, and per-model
`CURSOR_API_<MODEL_VAR>` knobs that a third-party web index
attributed to `cursor.com/docs/agent/environments`.

**Findings:**

- `https://cursor.com/docs/agent/environments` → **404** (path
  never existed or was retired).
- `https://cursor.com/docs/cli/configuration` → **404**.
- `https://cursor.com/docs/cli/api` → **404**.
- `https://cursor.com/docs/cli/environment-variables` → **404**.
- `https://cursor.com/docs/cli/reference` → **404**.
- Live docs search index (`Cmd-K`) on `cursor.com/docs/cli/overview`
  for query `CURSOR_API_KEY` → **"No results found."**

The cursor.com docs search index is rendered client-side via
cmdk (the React Command palette at the top of every docs page),
so this 0-hit search is a direct negative result, not a parse
limitation.

There is **no publicly documented environment-variable surface**
for the Cursor CLI in any reachable page on
`cursor.com/docs/*`. The `CURSOR_API_*` env-var claim appears
unsourced — likely either fabricated, retired from older docs,
or never shipped. Recommendation: **do not rely on it.**

### Configuration sources the CLI actually reads

Repository-direct fetch of the official install script
(`curl -sSL https://cursor.com/install | head -132`) confirms the
layout the AO adapter resolves against:

```bash
# From cursor.com/install (line 130-131):
ln -s ~/.local/share/cursor-agent/versions/<ver>/cursor-agent \
      ~/.local/bin/agent
ln -s ~/.local/share/cursor-agent/versions/<ver>/cursor-agent \
      ~/.local/bin/cursor-agent
```

Two takeaways from this:

1. **Both `agent` and `cursor-agent` are valid names** — `agent` is
   the primary symlink, `cursor-agent` is preserved as a legacy
   alias (comment in install script: *"primary: agent, legacy:
   cursor-agent"*). AO's hardcoded `cursor-agent` therefore
   continues to work indefinitely after a fresh install; no
   breakage.
2. **Real install path** is
   `~/.local/share/cursor-agent/versions/<ver>/`, with `~/.local/bin`
   as the on-PATH symlink target. Worth noting if AO ever wants to
   version-pin or detect the binary directly.

### CLI flags the binary accepts (confirmed live)

Rendered live from `https://cursor.com/docs/cli/overview`
(Playwright, 2026-07-03): flags actually accepted by the binary
include `--print` / `-p`, `--model`, `--output-format`, `--mode`
(`agent`/`plan`/`ask`), `--sandbox` (`enabled`/`disabled`),
`--trust`, `--continue`, `--resume="chat-id"`, plus interactive
subcommands `agent ls` and `agent resume`.

No env-var knobs for base URL / model override are listed in
this page. Routing is **flag-driven, not env-driven** by design;
the base URL / API key is owned by Cursor's login + billing
(Pro/Pro+/Ultra/Teams/Enterprise), not by a per-call override.

### Negative findings (audit-relevant)

- **`CURSOR_API_KEY` / `CURSOR_API_BASE_URL` / `CURSOR_API_<MODEL_VAR>`**
  — claim cannot be confirmed against any reachable current
  Cursor docs page; the docs search index returns zero hits, and
  every plausible URL (`/docs/agent/environments`,
  `/docs/cli/configuration`, `/docs/cli/environment-variables`)
  is 404. These env vars are likely fabricated or have been
  retired from older docs. Do not wire Bifrost gateway routing
  through them.
- **`OPENAI_API_KEY` as an exception** — same status; same single
  source, same 404.

### Implication for AO provider gateway

Cursor is the cleanest of all 23 audited adapters so far for
Bifrost, but in a *negative* sense: **the public Cursor CLI does
not expose a base-URL-override knob**, so AO cannot transparently
reroute Cursor traffic through the Bifrost gateway. Strategies:

1. **Accept the gap** for v1: let Cursor talk to `api.cursor.com`
   via its built-in OAuth login. Bifrost has no entry point here.
   Cheapest: zero code change in the cursor adapter.
2. **Config-file-injection** (riskier): Cursor is closed-source;
   we have no authoritative list of fields it reads from
   `~/.config/cursor/` or wherever it stores the active session
   context, so we'd be guessing. Skip for v1.
3. **Network-level proxy** (out-of-scope for the router-gateway
   RFC, would live at infra layer): possible but not the shape
   the Bifrost scaffold PR is scoped to.

**Recommendation:** treat Cursor as **out-of-scope for v1 of the
Bifrost gateway**. Document the gap in the gateway PR's adapter
matrix. Revisit only if/when Cursor adds a `--base-url`-style
flag (they have not, per live docs).

### Adapter changes needed for Bifrost

**None.** The cursor adapter is already a clean pass-through. If
the Bifrost gateway later needs to inject any env vars, the spawn
context's `cfg.Env` map is the right place; no cursor.go edits
required today.

### Open question surfaced

- **Binary name: `agent` vs `cursor-agent`** — both exist as
  symlinks today (verified directly from cursor.com/install
  script, 2026-07-03). AO's hardcoded `cursor-agent` is the
  legacy alias and still works after a fresh install. No
  immediate change is needed. A cosmetic refactor could switch
  to `agent` (the primary name) to match the docs-driven UX,
  but it is **strictly optional and not audit-priority**.
- **`cursor-agent` is the legacy window into the same binary**
  — for any future AO feature that wants to detect a binary
  that the user already has installed but the AO adapter cannot
  find, it is worth knowing both names are valid. Documented
  here so future agents do not re-derive it.


## `crush` (Charmbracelet Crush, binary `crush`, npm `@charmland/crush`)

Source adapter:
`backend/internal/adapters/agent/crush/crush.go` (245 lines,
package `crush`, adapter ID `"crush"`).

### Adapter self-description (verbatim from source)

> "Package crush implements the Crush agent adapter: launching new sessions,
> resuming sessions by native ID, and reading session info.
>
> Crush differs from other agents in that it doesn't have full hooks support,
> so GetAgentHooks and SessionInfo are no-ops for now. Session tracking is
> done through basic session ID management only."
> — `crush.go:1-7`

A note that matters for Bifrost: **no native hooks** means AO does not
derive native session identity from `.crush/logs/...` style files, it
relies on the `--session <id>` round-trip. Fine for AO's session model,
but worth flagging as a design constraint.

Launch argv:

```
crush [--cwd <WorkspacePath>] [--yolo] [-- <Prompt>]
```

Restore argv:

```
crush [--cwd <WorkspacePath>] [--yolo] --session <agentSessionId>
```

Permission flag mapping (per `crush.go:93-95`):

| AgentOps permission | Crush flag |
|---|---|
| `Default`           | *(no flag)* |
| `AcceptEdits`       | *(no flag)* |
| `BypassPermissions` | `--yolo`    |
| `Auto`              | *(no flag; closest is `--yolo` AO maps to bypass, not auto)* |

No native system-prompt flag — `cfg.SystemPrompt` / `cfg.SystemPromptFile`
are intentionally ignored (verified at `crush.go:65-71`). Initial prompt
is a positional argument after `--`.

### Env-var surface — adapter itself

The adapter touches **exactly one** environment variable, and it's only
for Windows binary resolution:

- `APPDATA` — at `crush.go:177` for the Windows PATH-resolution
  fallback (`%APPDATA%/npm/crush.cmd` etc.). This is the same
  one-env-touch pass-through pattern as `continueagent` and `cline`.

No other env reads/writes inside the adapter source.

### Env-var surface — Crush CLI proper

Primary source for the upstream is
[`charmbracelet/crush`](https://github.com/charmbracelet/crush). Verified
paths:

- `README.md` — top-of-file summary: *"Multi-Model: choose from a wide
  range of LLMs or add your own via OpenAI- or Anthropic-compatible
  APIs"* (line ~16). Install: `brew install charmbracelet/tap/crush`,
  `npm install -g @charmland/crush`, plus Winget / Scoop / Nix / etc.
- `internal/cmd/root.go` lines 54-61 — confirmed CLI flag set:

  | Flag          | Short | Purpose                                         |
  |---------------|-------|-------------------------------------------------|
  | `--cwd`       | `-c`  | current working directory                       |
  | `--data-dir`  | `-D`  | custom crush data directory (separate from cwd) |
  | `--debug`     | `-d`  | debug logging                                   |
  | `--host`      | `-H`  | client/server host (advanced)                   |
  | `--yolo`      | `-y`  | accept all permissions (dangerous mode)         |
  | `--session`   | `-s`  | continue a session by ID                        |
  | `--continue`  | `-C`  | continue most recent session                    |
  | `--help`      | `-h`  | help                                            |

  AO's adapter uses `--cwd`, `--yolo`, `--session`; the others
  are AO-irrelevant.

- `internal/env/env.go` — `os.Getenv` wrapper. No provider-related
  base-URL knobs found in this file.
- `internal/config/provider.go`, `internal/config/load.go` — config
  resolution layer.

#### Per-provider API-key env vars (from README, exact)

Crush supports 25 direct provider env-var aliases for an API key
(verbatim from the README env-table):

```
HYPER_API_KEY              → Charm Hyper
ANTHROPIC_API_KEY          → Anthropic
OPENAI_API_KEY             → OpenAI
VERCEL_API_KEY             → Vercel AI Gateway
GEMINI_API_KEY             → Google Gemini
SYNTHETIC_API_KEY          → Synthetic
ZAI_API_KEY                → Z.ai
MINIMAX_API_KEY            → MiniMax
HF_TOKEN                   → Hugging Face Inference
CEREBRAS_API_KEY           → Cerebras
OPENROUTER_API_KEY         → OpenRouter
IONET_API_KEY              → io.net
ALIBABA_SINGAPORE_API_KEY  → Alibaba (Singapore)
GROQ_API_KEY               → Groq
AVIAN_API_KEY              → Avian
OPENCODE_API_KEY           → OpenCode Zen & Go
VERTEXAI_PROJECT           → Google Cloud VertexAI (Gemini)
VERTEXAI_LOCATION          → Google Cloud VertexAI (Gemini)
AWS_ACCESS_KEY_ID          → Amazon Bedrock (Claude)
AWS_SECRET_ACCESS_KEY      → Amazon Bedrock (Claude)
AWS_REGION                 → Amazon Bedrock (Claude)
AWS_PROFILE                → Amazon Bedrock (Custom Profile)
AWS_BEARER_TOKEN_BEDROCK   → Amazon Bedrock
AZURE_OPENAI_API_ENDPOINT  → Azure OpenAI models
AZURE_OPENAI_API_KEY       → Azure OpenAI models (optional w/ Entra ID)
AZURE_OPENAI_API_VERSION   → Azure OpenAI models
```

That's the index of *direct* `API_KEY` style env hooks.

#### The `CRUSH_<VAR>` re-prefix layer (CRITICAL for Bifrost)

Direct-fetch of `internal/config/load.go` lines 168-193 confirms a
**brilliant pattern**:

```go
// PushPopCrushEnv scans the environment for any CRUSH_-prefixed
// variables, and during config resolution lifts them into the
// underlying provider env namespace. At function exit the original
// values are restored.
func PushPopCrushEnv() func() {
    found := []string{}
    for _, ev := range os.Environ() {
        if strings.HasPrefix(ev, "CRUSH_") { … }
    }
    backups := make(map[string]string)
    for _, ev := range found {
        backups[ev] = os.Getenv(ev)
    }
    for _, ev := range found {
        os.Setenv(ev, os.Getenv("CRUSH_"+ev))
    }
    restore := func() { … }
    return restore
}
```

…and `configureProviders` (line 198) does
`restore := PushPopCrushEnv(); defer restore()` so the lift runs on
every config-load / refresh.

**Translation for Bifrost**, courtesy of this layer:

- Setting `CRUSH_OPENAI_API_KEY=...` (in the **crush process's own**
  environment, i.e. via `cfg.Env` at spawn time) lifts it to
  `OPENAI_API_KEY` for the duration of provider resolution, then
  restores the user's original `OPENAI_API_KEY`.
- Same for `CRUSH_ANTHROPIC_API_KEY`, `CRUSH_GROQ_API_KEY`, etc.
- This is **purpose-built for routing hooks like Bifrost** and is
  comparable in spirit to `CONTINUE_GLOBAL_DIR` for continueagent.

#### The single live `BASE_URL` env exception: `HYPER_URL`

Direct-fetch of `internal/agent/hyper/provider.go` confirms:

```go
// BaseURL returns the base URL, which is either $HYPER_URL or the default.
var BaseURL = sync.OnceValue(func() string {
    return cmp.Or(os.Getenv("HYPER_URL"), defaultBaseURL)
})
```

This is **only** for the Charm-Hyper (orchestration) provider. None of
the other 25+ providers expose a `*_BASE_URL` analogue in the upstream
source — the `crush.json` `base_url` field is the only override on the
config-file side.

#### Config-file layers (crush order, from README)

```
1. .crush.json                          (project-local)
2. crush.json                           (project-local)
3. $CRUSH_GLOBAL_CONFIG/crush.json      (user-global, env-overridden)
   (default: $HOME/.config/crush/crush.json)
```

`base_url` and `api_key` for any provider live in the JSON, and they
**expand shell-style** (`$VAR`, `${VAR:-default}`, `$(command)`,
`${VAR:?error}` per README §"MCPs" / §"Security note"). That means
**the per-provider base URL can be supplied via environment by stuffing
`"base_url": "$AO_BIFROST_BASE"`** into the AO-managed provider entry,
no separate `*_BASE_URL` env var needed.

### Negative findings (audit-relevant)

- **No global `CRUSH_API_BASE`** (or any provider-wide base-URL env
  knob other than the `HYPER_URL` exception). The pattern is
  per-provider in `crush.json`, with shell-expansion. Practical for
  Bifrost but slightly more elaborate than a single-env-var.
- **`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` style env vars are not
  honoured by Crush itself.** The user has to put the URL in
  `crush.json` (or `CRUSH_<PROVIDER>_BASE_URL` could be aliased via
  config-file shell expansion, but there's no first-class hook).

### Implication for AO provider gateway

Crush is the **third clean Bifrost route in the audit** (after
claude-code and continueagent) and the **first to expose a literal
in-process env-rewrite** for credentials — `PushPopCrushEnv()`.
Practical AO-side strategy:

1. **Provider choice**: pick ONE provider whose protocol Bifrost
   speaks (Bifrost has been OpenAI-compat so far in discussions —
   verify in RFC 002). Set `CRUSH_OPENAI_API_KEY=<bifrost-token>`
   in `cfg.Env` at spawn time. PushPopCrushEnv lifts it transiently
   to `OPENAI_API_KEY`.
2. **Base URL override**: write a tiny entry into the user's
   `crush.json` (project-layer if AO uses a per-project write, or
   user-layer `~/.config/crush/crush.json` if AO overrides globally).
   Example shape:
   ```json
   {
     "providers": {
       "openai": {
         "id": "openai",
         "type": "openai",
         "base_url": "${AO_BIFROST_BASE:-http://127.0.0.1:<bifrost-port>/v1}",
         "api_key": "$AO_BIFROST_TOKEN",
         "models": [{ "id": "...", "name": "..." }]
       }
     }
   }
   ```
3. **No adapter changes needed**: the AO crush adapter is already
   one-env-touch pass-through (`APPDATA` only). config-env injection
   happens via `cfg.Env` at spawn, not in the adapter itself.

### Adapter changes needed for Bifrost

**None.** Adapter is already a clean pass-through. If Bifrost
needs to inject `CRUSH_OPENAI_API_KEY`, `AO_BIFROST_BASE`,
`AO_BIFROST_TOKEN` into the crush-process env, the spawn context's
`cfg.Env` map is the right place; AO does not need to edit
`crush.go` for Bifrost to work end-to-end.

### Open questions surfaced

- **Where the Bifrost entry lives in crush.json**: project-layer
  `.crush.json` (if AO wants a per-project Bifrost override) or
  user-layer `~/.config/crush/crush.json` (one global override).
  Mirror of the same codex/continueagent preserve-vs-rewrite
  shape. Decision flagged, not made.
- **Exact env-var the adapter should export**: `CRUSH_OPENAI_API_KEY`
  for the token, `AO_BIFROST_BASE` for the base URL (via JSON
  shell-expansion, since Crush has no `_BASE_URL` env hook for
  non-Hyper providers). The names are AO's to choose; not invented
  here.
- **`CRUSH_GLOBAL_CONFIG` / `CRUSH_GLOBAL_DATA` env overrides**
  exist and would let AO redirect Crush's data dir to under
  `AO_HOME`. Worth flagging as a candidate AO_HOME-friendly hook
  if Phase 1 hasn't yet made Crush migrate its `$HOME/.local/share/crush`
  to AO-managed paths naturally; but that's an XOR-followup, not
  Bifrost-shape.

## `kilocode` (Kilo-Org/kilocode, binary `kilocode` alias `kilo`, npm `@kilocode/cli`)

Source adapter:
`backend/internal/adapters/agent/kilocode/kilocode.go` (323 lines,
package `kilocode`, adapter ID `"kilocode"`).

### Adapter self-description (verbatim from source)

> "Package kilocode implements the Kilo Code CLI agent adapter: launching new
> TUI sessions, resuming sessions by native id, installing a workspace-local
> activity plugin, and reading plugin-derived session info.
>
> The Kilo Code CLI (binary "kilocode", also aliased "kilo"; npm package
> @kilocode/cli) is a fork of sst/opencode and shares its CLI surface and
> plugin runtime, so AO bridges it the same two ways it bridges opencode:
>   - It has no native command-hook config … Its only
>     lifecycle-extensibility surface is the @opencode-ai plugin SDK loaded
>     from a config dir's `{plugin,plugins}/*.{ts,js}` glob …
>   - Its interactive TUI exposes no permission flag (the --auto flag lives only
>     on `kilo run`, not the default TUI command AO launches) and no
>     system-prompt flag. AO's graduated permission modes are delivered via the
>     **KILO_CONFIG_CONTENT** env var, which Kilo deep-merges as the
>     highest-precedence inline config; the system prompt defers to Kilo's own
>     config."
> — `kilocode.go:1-22`

Launch argv:

```
[env KILO_CONFIG_CONTENT=<json>] kilocode [--prompt <prompt>]
```

Restore argv:

```
[env KILO_CONFIG_CONTENT=<json>] kilocode --session <agentSessionId>
```

The adapter constructs the `KILO_CONFIG_CONTENT=<json>` prefix as the
**first** argv element (wrapped in `env` so the shell actually
performs the assignment, since the runtime quotes elements that would
otherwise be command tokens) — see `kilocode.go:208-225`. The
permission-to-action shape is `{"permission": {"edit": "allow", ...}}`.

Permission flag mapping (per `kilocode.go:186-197`):

| AgentOps permission | Kilo config payload injected via env |
|---|---|
| `Default`           | *(no env; Kilo's config decides)*      |
| `AcceptEdits`       | `{"permission": {"edit": "allow"}}`    |
| `Auto`              | `{"permission": {"edit": "allow", "bash": "allow"}}` |
| `BypassPermissions` | `{"permission": {"*": "allow"}}`       |

No native system-prompt flag — Kilo resolves system prompts from its
own config + `AGENTS.md` rules.

### Env-var surface — adapter itself

The adapter touches **exactly one** environment variable, and it's
the same Windows-binary-resolution pattern as the other adapters:

- `APPDATA` — at `kilocode.go:259` for the Windows PATH-resolution
  fallback (`%APPDATA%/npm/kilocode.cmd` etc.).

No other env reads/writes in the adapter source.

### Env-var surface — Kilo CLI proper

Primary source for the upstream is
[`Kilo-Org/kilocode`](https://github.com/Kilo-Org/kilocode). Verified
paths:

#### `KILO_CONFIG_CONTENT` (and the config precedence)

Authoritative per the AO adapter header comment
(`kilocode.go:166-173`):

> "It is the permission-control surface the interactive TUI honors …
> CLI's config precedence: **global -> `KILO_CONFIG` -> ./kilo.json ->
> .kilo/kilo.json -> `KILO_CONFIG_CONTENT` -> managed**; later wins."

So the full surface of config-overriding env vars is:

| Env var                       | Purpose                              |
|-------------------------------|--------------------------------------|
| `KILO_CONFIG_CONTENT`         | Highest-precedence inline JSON config| 
| `KILO_CONFIG`                 | File-path override for the second tier |

Both are real, both are honored by Kilo. AO already uses the top one
(`KILO_CONFIG_CONTENT` is set in argv by the adapter for permission
modes).

#### Per-provider env-var catalog

The Kilo provider registry is a data-driven model. Direct fetch of
`packages/core/src/config/provider.ts` confirms the per-provider shape:

```ts
export class Info extends Schema.Class<Info>("ConfigV2.Provider")({
  name: Schema.String.pipe(Schema.optional),
  env: Schema.String.pipe(Schema.Array, Schema.optional),
  endpoint: ProviderV2.Endpoint.pipe(Schema.optional),
  options: Options.pipe(Schema.optional),
  models: Schema.Record(Schema.String, Model).pipe(Schema.optional),
}) {}
```

— i.e. each provider entry can declare:
  - `env: string[]` — a list of env-var names whose presence enables
    the provider (e.g. `["ANTHROPIC_API_KEY"]`).
  - `endpoint: string` — per-provider endpoint override (e.g. a
    self-hosted URL).
  - `options.baseURL` / `options.apiKey` — inline credential/URL.

The activation logic is in
[`EnvPlugin`](https://github.com/Kilo-Org/kilocode/blob/main/packages/core/src/plugin/env.ts)
— a 22-line plugin that on `catalog.transform` iterates each
provider's `env: []` list and, when any key is set in `process.env`,
flags that provider as `enabled: { via: "env", name: <key> }`.

That plugin is the **runtime mechanism** by which Kilo auto-picks
the active provider. Every provider's `env: []` list is the
*Bifrost-hook fingerprint*.

#### Per-provider env-var table (cross-checked from docs)

Direct-fetch of `packages/kilo-docs/pages/ai-providers/*.md` confirms
the per-provider env-var list (each provider entry in `kilo.json`
uses these):

```
ANTHROPIC_API_KEY                  → anthropic
OPENAI_API_KEY                     → openai
GOOGLE_GENERATIVE_AI_API_KEY       → gemini
DEEPSEEK_API_KEY                   → deepseek
GROQ_API_KEY                       → groq
CEREBRAS_API_KEY                   → cerebras
FIREWORKS_API_KEY                  → fireworks
HF_TOKEN                           → huggingface
MISTRAL_API_KEY                    → mistral
OPENROUTER_API_KEY                 → openrouter
AWS_ACCESS_KEY_ID,                 → bedrock (also AWS_SECRET_ACCESS_KEY,
AWS_SECRET_ACCESS_KEY,                       AWS_REGION, AWS_PROFILE,
AWS_REGION,                                  AWS_BEARER_TOKEN_BEDROCK)
AWS_BEARER_TOKEN_BEDROCK
GOOGLE_CLOUD_PROJECT,              → vertex (also
GOOGLE_CLOUD_LOCATION                        GOOGLE_CLOUD_PROJECT_ID, etc.)
CLOUDFLARE_ACCOUNT_ID,             → cloudflare (also
CLOUDFLARE_API_KEY                           CLOUDFLARE_GATEWAY_ID,
                                            CLOUDFLARE_API_TOKEN)
```

(Verified by curl-fetching each `*.md` page and grepping `export `
for the env-var name and the `env: [...]` JSON snippet.)

#### `KILO_CONFIG_CONTENT` shape for routing

The JSON schema for the inline config is precisely:

```jsonc
{
  "provider": {
    "<vendor-id>": {
      "npm": "@ai-sdk/openai-compatible",  // or openai, or anthropic
      "env": ["<TOKEN_ENV_VAR_NAME>"],     // optional; presence activation
      "options": {
        "apiKey": "<token-or-literal>",
        "baseURL": "<full-provider-url>"
      },
      "models": { "<model-id>": { "name": "...", "limit": {"context":N,"output":M} } }
    }
  }
}
```

Verified by direct-fetch of
`packages/kilo-docs/pages/ai-providers/openai-compatible.md` (the
"Custom OpenAI-compatible provider" guide, lines 80-130). The same
provider is named `baseURL` in the JSON options, with full-endpoint
support: e.g. `https://api.provider.com/v1/chat/completions` is a
valid `baseURL` value.

### Negative findings (audit-relevant)

- **No global `KILO_BASE_URL`** (or any provider-wide base-URL env
  knob). The pattern is per-provider in `kilo.json` / `kilo.jsonc`,
  just like opencode / crush.
- **`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` style env vars aren't
  used by Kilo as first-class routing hooks.** The user must put
  the URL in `kilo.json`, exact same shape as the cluster of
  pass-through adapters above.

### Implication for AO provider gateway

Kilo is the **fourth clean Bifrost route** in the queue (after
claude-code, continueagent, crush) and the **cleanest so far**
because:

1. Kilo already accepts a JSON config blob via `KILO_CONFIG_CONTENT`
   and the adapter is *already* writing JSON to that env var
   (for permission modes — see `kilocode.go:166-225`). The Bifrost
   gateway entry can **piggyback on the same wiring**: salt the
   permission JSON or extend the schema with a `provider` block.
2. The `EnvPlugin` activation check (scan provider's `env: []`)
   means AO can opt-in to activation by setting one env var
   per provider; that variable can be a *literal token*, or
   `KILO_BIFROST_PROVIDER_TOKEN`, lifted and not exported elsewhere.
3. Per-provider `baseURL` is config-only. AO must inject a JSON
   config block (either via `KILO_CONFIG_CONTENT` or by writing
   `kilo.json` in workspace) that names a Bifrost entry
   (e.g. `provider.bifrost` with `npm: "@ai-sdk/openai-compatible"`).
4. **No adapter change needed.** The AO adapter is already a clean
   pass-through (single `APPDATA` Windows lookup, no API key,
   no base URL touches).

### Adapter changes needed for Bifrost

**None.** The kilocode adapter is a clean pass-through. Future
gateway writer can either:
- extend `kilocodePermissionEnvPrefix` (`kilocode.go:208`) to include
  the Bifrost provider entry alongside the permission JSON, or
- write the Bifrost entry to the user's `kilo.json` separately.
Neither path requires editing the launch-argv logic.

### Open question surfaced

- **How piggyback-friendly is `KILO_CONFIG_CONTENT`?** Today the
  adapter writes only `{"permission": {...}}`. The same env var
  accepts a full provider config (root keys `provider.*`, `model`,
  etc.). Whether the Bifrost gateway writer uses this same env var
  (clean; just one env-var setup) or a separate config-file write
  to `kilo.json` (cleaner separation; slower) is an AO-internal
  decision. Two-tagged options, **not flagged**.
- **`KILO_CONFIG` as a path override** — useful for AO_HOME-friendliness
  (redirect Kilo's config dir to under `AO_HOME/kilo/`), but
  separate from Bifrost routing. Surface flagged; Phase-2 followup.

## `amp` (Sourcegraph Amp CLI, binary `amp`, npm `@ampcode/cli`)

Source adapter:
`backend/internal/adapters/agent/amp/amp.go` (229 lines,
package `amp`, adapter ID `"amp"`).

### Adapter self-description (verbatim)

> "Package amp implements the Amp agent adapter: launching new
> interactive Amp sessions and resuming sessions when a native
> Amp thread id is known.
>
> Amp activity hooks and SessionInfo derivation will likely require an
> Amp-specific TypeScript plugin, similar to opencode. Until that
> integration exists, hook installation and SessionInfo are
> intentionally no-ops."
> — `amp.go:1-7`

Launch argv (per `amp.go:62-87`):

```
amp [--permission-mode <mode>] [--append-system-prompt <prompt> | --append-system-prompt-file <path>] [-- <prompt>]
```

Restore argv (per `amp.go:108-127`):

```
amp [--permission-mode <mode>] --resume <agentSessionId>
```

`appendPermissionFlags` (amp.go:137-146):

| AgentOps mode        | Amp argv fragment                          |
|----------------------|--------------------------------------------|
| `Default`            | *(none)*                                   |
| `AcceptEdits`        | `--permission-mode acceptEdits`            |
| `Auto`               | `--permission-mode auto`                   |
| `BypassPermissions`  | `--permission-mode bypassPermissions`      |

Note the exact spelling matches Claude Code's `--permission-mode`
flag values (`acceptEdits`/`auto`/`bypassPermissions`) — the
underlying CLI is in the Claude Code family.

Tests confirm (`amp_test.go`):
- argv inversion with no `AgentSessionId` returns `ok=false`
  (restore behaves like fresh launch fallback).
- `--append-system-prompt-file` is preferred over
  `--append-system-prompt` when both are set (matches Claude Code
  adapter).

### Env-var surface — adapter itself

The adapter touches **exactly one** environment variable
(`amp.go:166`):

```
if appData := os.Getenv("APPDATA"); appData != "" {
    candidates = append(candidates,
        filepath.Join(appData, "npm", "amp.cmd"),
        filepath.Join(appData, "npm", "amp.exe"),
    )
}
```

— Windows-only binary-path resolution; same pass-through pattern as
the other adapters.

No other env reads/writes in the adapter source.

### Env-var surface — Amp CLI proper

The Amp CLI is proprietary, distributed via a single binary from
`ampcode.com/install.sh`. Public env-var documentation is split
across:

#### Install-time env vars (irrelevant to runtime)

From direct-fetch of `https://ampcode.com/install.sh` (verified
2026-07-03):

| Env var           | Purpose                                  |
|-------------------|------------------------------------------|
| `AMP_HOME`        | Base install dir (default `$HOME/.amp`)  |
| `AMP_STORAGE_BASE`| Where to fetch the binary                |
| `AMP_URL`         | Source for the install pubkey            |
| `AMP_VERSION`     | Pinned version, else latest              |

These control the **installer**, not the launched Amp session.

#### Runtime env vars (from official docs)

From direct-fetch of `https://ampcode.com/manual` (verified
2026-07-03):

| Env var                       | Purpose                                |
|-------------------------------|------------------------------------------|
| `AMP_API_KEY`                 | Access token (UTF-8 string token)        |
| `AMP_FORCE_BEL`               | Force terminal bell when set              |
| `AMP_SKIP_UPDATE_CHECK`       | Set to `1` to disable update checks      |
| `HTTP_PROXY` / `HTTPS_PROXY`  | Node.js standard proxy knobs             |
| `NODE_EXTRA_CA_CERTS`         | Custom CA bundle                         |
| `EDITOR`                      | Editor for `Ctrl+G`                      |

Settings namespace prefix is `amp.*`, with documented settings
covering user-experience toggles only (`amp.fuzzy.alwaysIncludePaths`,
`amp.showCosts`, `amp.git.commit.ampThread.enabled`,
`amp.git.commit.coauthor.enabled`, `amp.keymap`, `amp.mcpServers`,
`amp.defaultVisibility`, `amp.notifications.enabled`,
`amp.skills.disableClaudeCodeSkills`, `amp.skills.path`,
`amp.terminal.copyOnSelect`,
`amp.terminal.detailsExpandedExpanded`,
`amp.tools.disable`, `amp.mcpPermissions`, `amp.updates.mode`,
`amp.admin.compatibilityDate`). **None** of these are
provider-routing knobs.

#### Negative finding (audit-critical)

- **No documented `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN`
  / `ANTHROPIC_MODEL` env knob on `ampcode.com/manual`.** The
  manual exposes user-experience and update settings, not
  provider-override knobs. This is *inconsistent* with the
  Claude-Code-shaped `--permission-mode` values in the AO
  adapter, which suggests Amp uses the Claude Code SDK
  internally but does not surface the SDK's known env knobs
  to CLI users.
- **No `AMP_BASE_URL`, `AMP_API_BASE_URL`, or `AMP_<VENDOR>_BASE_URL`
  knob in any reachable doc page.** The `https://ampcode.com/models`
  page documents which models Amp routes to via Amp's own
  routing layer (NOT a user-configurable base-URL set), but
  does not expose per-vendor URL knobs (verified
  2026-07-03).
- **No settings.json provider override key documented.**
  The manual's `amp.*` settings list is exhaustively
  UI-feature-focused; no `amp.provider.*`,
  `amp.models.*`, or similar is present.
- **`AMP_API_KEY` is the only authentication plumbing** — it
  authenticates to Amp's own server (Amp threads /
  threads.ampcode.com), not a vendor model API. Setting this
  to a Bifrost-issued token would not transparently route
  model traffic.

#### A note on the WebSearch hint

The initial WebSearch summary (`query: "Sourcegraph Amp CLI env
vars ANTHROPIC_BASE_URL API key model override"`) returned a
generic *probable* env-var list of `ANTHROPIC_*` based on the
Claude Code SDK convention. **This is unverified** — direct
fetches of every reachable page on `ampcode.com` (root, `/manual`,
`/models`, `/install.sh`, plus npm metadata) found no
documentation of these specific env knobs in Amp's own CLI.
Treating them as a verified env surface would invalidate the
audit; we explicitly discard the unverified claim and report
the negative finding instead.

### Binary / install shape

- Single binary: `amp` (POSIX), `amp.exe` (Windows).
- npm package: `@ampcode/cli` (the WebFetch-installed page
  confirmed `bin: { amp: "bin/amp.exe" }` per published
  version, plus a `node install.cjs` postinstall).
- Homebrew: `brew install ampcode/tap/ampcode` (binary
  `ampcode`, but no `amp` — AO's hardcoded `amp` binary resolves
  on PATH as long as the install script's symlink targets hold).
- Settings file:
  `~/.config/amp/settings.json` (or `.jsonc`);
  `--settings-file <path>` overrides.

### Implication for AO provider gateway (Bifrost)

- **No clean Bifrost route** in Amp CLI proper. The CLI does
  not expose the necessary provider-override knobs in any
  documented user-config surface.
- The Amp adapter itself is a clean **pass-through**, so it
  does not block Bifrost in any other way — but Bifrost
  would have to either:
  1. Inject provider overrides into the Amp session's
     **process environment** such that Amp parses them
     internally (requires reverse-engineering the binary
     or contact with Sourcegraph). Not feasible in v1.
  2. Slow-down option: write an Amp settings.json entry
     that the CLI honors — but no such entry is documented,
     so empirical testing would be required.
  3. Out of scope for Amp routing: tell users that Amp's
     subset of Amp's models is `threads.ampcode.com`-routed,
     and route user-model selection via a different adapter.
- **No adapter change needed for the existing pass-through.**
  The adapter code remains correct.

### Open question surfaced

- **Is the `ANTHROPIC_*` env surface inherited from Amp's
  internal SDK use but undocumented?** Possible paths:
  - Reverse-engineer with `strings(1)` on `bin/amp.exe` for
    the literal env-var names it probes (cheap, but a
    one-time research artifact, not a maintainable surface).
  - Contact Sourcegraph for the canonical knob list (long
    lead time, out of autonomous loop).
  - Test in a sandbox: set each `ANTHROPIC_*` and inspect
    `~/.config/amp/settings.json` for whether the value is
    shadowed or transmitted.
  - This is **not flagged as Phase-2 blocking** because the
    audit's negative finding is honest and current; the
    followup is *enablement*, not correctness.

## `auggie` (Augment Code, binary `auggie`, npm `@augmentcode/auggie`)

Source adapter:
`backend/internal/adapters/agent/auggie/auggie.go` (255 lines,
package `auggie`, adapter ID `"auggie"`).

### Adapter self-description (verbatim, package doc)

> "Package auggie implements the Auggie (Augment Code) agent adapter:
> launching new headless Auggie sessions and resuming sessions when
> a native Auggie session id is known.
>
> Auggie is Augment Code's terminal coding agent (binary "auggie",
> installed via `npm install -g @augmentcode/auggie`). It exposes
> a headless one-shot mode via `--print` (alias `-p`) which runs a
> single instruction and exits — the mode AO uses to drive it
> unattended.
>
> Launch shape:
>
> 	auggie --print [--instruction-file <f> | --instruction <s>] [-- <prompt>]
>
> Permissions: Auggie has no single "approve everything" flag.
> It governs unattended tool/file approval through granular
> `--permission <tool>:<allow|deny>` rules (and a read-only
> `--ask` mode), not a 4-mode bypass like Claude Code. Because
> there is no verifiable blanket auto-approve flag, every AO
> permission mode emits no flag and defers to the user's Auggie
> configuration, rather than guessing a flag that does not exist.
>
> Resume: Auggie supports `--resume <sessionId>` (alias `-r`),
> usable with `--print` for headless resume. AO only has a native
> session id to resume from when one was captured into session
> metadata; Auggie exposes no hook/lifecycle system, so that id
> is not captured automatically yet.
>
> Hooks/activity: Auggie has no hook or lifecycle event system
> (it reads .claude/commands/ for slash commands, but that is not
> Claude Code hook compatibility). Hook installation and
> SessionInfo are intentionally no-ops (Tier C) until an
> Auggie-specific activity integration exists."
> — `auggie.go:1-37`

Launch argv (`auggie.go:98-117`):

```
auggie --print [--instruction-file <f> | --instruction <s>] [-- <prompt>]
```

Restore argv (`auggie.go:142-156`):

```
auggie --print --resume <sessionId>
```

Permission mapping (per adapter doc-comment): **none** — every
mode emits no flag. Reflected in the test
`TestGetLaunchCommandPermissionModesEmitNoFlag` at
`auggie_test.go:71-97`: the desired cmd for every permission
mode is `[]string{"auggie", "--print"}`. Source of truth matches
the package doc.

### Env-var surface — adapter itself

Single touch (`auggie.go:191`):

```
if appData := os.Getenv("APPDATA"); appData != "" {
    candidates = append(candidates,
        filepath.Join(appData, "npm", "auggie.cmd"),
        filepath.Join(appData, "npm", "auggie.exe"),
    )
}
```

— Windows-only binary-path resolution, same pass-through pattern
as the rest of the adapter set. Zero other env reads/writes in
the adapter source.

### Env-var surface — Auggie CLI proper

Source paths exercised (all direct-fetched 2026-07-03):

- `registry.npmjs.org/@augmentcode/auggie/latest` — package
  metadata: `bin: { "auggie": "augment.mjs" }`, `description:
  "Auggie CLI Client by Augment Code"`, `homepage:
  https://augmentcode.com`. The bin target is a `.mjs` compiled
  bundle, not an open-source source distribution.
- `https://augmentcode.com` (homepage) — marketing copy mentions
  "BYOK for models" as a capability and links
  `https://docs.augmentcode.com` for details; **no env var name,
  base-URL knob, or flag is published on the homepage.**
- `https://docs.augmentcode.com/cli/overview` and the parent
  `/docs` route — confirms `--print`, `--quiet` as the only CLI
  flags documented in the CLI overview; verification: install
  is `npm install -g @augmentcode/auggie`, login is
  `auggie login`. No env vars mentioned.
- `https://docs.augmentcode.com/models` — model-selection is via
  `/model` slash command (interactive) or `--model <name>` flag
  (headless). Quoted verbatim from the page:

  > "In Auggie CLI, use the `/model` slash command or pass the
  > `--model` flag with the desired model."

- `https://docs.augmentcode.com/models/available-models` —
  confirms there is no env-var on this page for any of the
  supported model families (Claude / Gemini / GPT / Kimi /
  Prism variants). The Augment-internal router is named
  **Prism** and is not user-controllable for base URL:

  > "Prism lets Augment choose the best-fit model for each
  > request. Instead of locking you into a single model, each
  > Prism option routes within a curated model family…"

- Org search via `gh api orgs/augmentcode/repos --paginate`
  does not return an `auggie` or `@augmentcode/auggie`-shaped
  repository name (the `augmentcode` GitHub org carries
  unrelated repos: DeepSpeed, environments, spark, etc.). The
  CLI source is **not** open-source on GitHub.

### Negative finding (audit-critical)

- **No `AUGMENT_*` env-var family exists** in any reachable
  docs page. `docs.augmentcode.com` exposes the CLI overview,
  token-based pricing, and the model-availability catalog, none
  of which call out env-var knobs for base URL, API key, or
  model override.
- **No `ANTHROPIC_*` / `OPENAI_*` etc. are honored by auggie**
  for the same reason: auth is via OAuth (`auggie login`,
  standard pattern for closed-source coding CLIs). The model
  is selected by Prism routing inside Augment, *not* by the
  user setting an env var.
- **`--model <name>` is the only model-pick knob** — and it
  just selects among Augment's curated list (Prism variants
  plus named models: Claude Opus 4.7, Gemini 3.1, GPT 5.4/5.5,
  Kimi variants). It does not let the user specify an
  external base URL.
- **`--print` and `--quiet` are the only documented flags.**
  Everything else (instructions, resume) is flow-shaping, not
  routing.
- **No public BYOK plumbing** is documented in the env-var
  sense — "BYOK for models" is a marketing capability statement
  for the **entire Augment platform**, but the per-user key
  delivery to Auggie's CLI process is OAuth-bearer, not a
  config-file plumbed base URL.

### Implications for AO provider gateway (Bifrost)

- **No clean Bifrost route for Auggie in v1.** The CLI is
  closed-source and OAuth-bound to Augment's billing; there
  is no documented env-var surface that could route model
  traffic to an alternate URL.
- Alternative paths (all out of v1 scope for an honest audit):
  - Reverse-engineer the `.mjs` bundle with `strings(1)` for
    env-var names (single research artifact; not a stable
    surface).
  - Sandbox test: set various env vars and observe whether
    the request lands at Augment or elsewhere (binary uses
    HTTPS host pinning in many closed-source products, so
    this is unreliable).
  - Long-term: contact Augment for a documented BYOK env
    surface (lead-time); out of autonomous loop.
- **No adapter change needed for pass-through.**
  `auggie.go` continues to call `auggie --print …` and
  inherits whatever Augment's auth machinery does. The
  adapter is correct.

### Adapter changes needed for Bifrost

**None.** Pass-through; no permission flag mapping, no env
plumbing, no base URL hook. Same shape as Cursor / amp on the
"no Bifrost route" axis.

### Open question surfaced

- **What if the user sets a `--model <prism-variant>` not
  served by their tier?** Augment may reject the request and
  bubble a CLI error; not Bifrost-relevant. Flagged only as
  a UX note, not a v1 audit constraint.

## `autohand` (Autohand AI Code, binary `autohand`, npm `@autohand/code-cli`, repo `autohandai/code-cli`)

Source adapter:
`backend/internal/adapters/agent/autohand/autohand.go` (284 lines)
+ `hooks.go` (337 lines) + `activity.go` (26 lines),
package `autohand`, adapter ID `"autohand"`.

### Adapter self-description (verbatim)

> "Package autohand implements the Autohand Code agent adapter:
> launching new command-mode sessions, resuming native sessions
> by id, installing AO's lifecycle hooks into Autohand's config,
> and reading hook-derived session info.
>
> Autohand ('autohand') is an autonomous coding agent with a
> non-interactive command mode (`autohand -p <prompt>` /
> positional prompt), native session resume (`autohand resume
> <sessionId>`), and a native hook/lifecycle system whose events
> (session-start, stop, permission-request, ...) AO maps onto
> activity states. See hooks.go for hook installation and
> activity.go for the event→state mapping."
> — `autohand.go:1-11`

Launch argv (`autohand.go:75-99`):

```
autohand [--path <workspace>] [<approval flags>] [--sys-prompt <value>] [-- <prompt>]
```

Restore argv (`autohand.go:115-134`):

```
autohand resume [--path <workspace>] <sessionId>
```

Approval mode mapping (per `autohand.go:165-176`):

| AgentOps mode         | Autohand argv fragment            |
|-----------------------|-----------------------------------|
| `Default`             | *(no flag — defer to user's config; permissions.mode)* |
| `AcceptEdits`         | `--yes`                            |
| `Auto`                | `--unrestricted`                   |
| `BypassPermissions`   | `--unrestricted`                   |

Note: AO's test (`autohand_test.go`'s expected-values
table) documents this mapping exactly. Adapter
self-doc-comment notes that "Autohand has no distinct
'accept-edits' mode, so it maps to `--yes` (auto-confirm
risky actions) — the least-privileged non-interactive
option".

System prompt (per `autohand.go:88-92`) uses
`--sys-prompt` and auto-detects file vs inline value based
on the AO field used (`SystemPromptFile` overrides
`SystemPrompt`).

### Env-var surface — adapter itself

Single touch (`autohand.go:211`):

```
if appData := os.Getenv("APPDATA"); appData != "" {
    candidates = append(candidates,
        filepath.Join(appData, "npm", "autohand.cmd"),
        filepath.Join(appData, "npm", "autohand.exe"),
    )
}
```

— Windows-only binary-path resolution. Zero other env
reads/writes in `autohand.go`, `hooks.go`, or `activity.go`.

`hooks.go` (337 lines) is a full hooks install/resolver —
it manages Autohand config files (the
`~/.autohand/config.{json,toml,yaml,yml}` paths), but
does **not** read the AO gateway's env vars. It's a
filesystem-level pass-through to Autohand's own config.

### Env-var surface — Autohand CLI proper (open-source)

Autohand is open-source — `autohandai/code-cli` is a
public repo with 140 stars, last commit 2026-07-03
(verified via `gh search repos "autohand"`).
Install:

```
curl -fsSL https://autohand.ai/install.sh | bash
# or
git clone https://github.com/autohandai/cli.git
cd cli && bun install && bun run build && bun add -g .
```

#### `.env.example` (direct-fetched from
`autohandai/code-cli/main/.env.example`)

Verified verbatim — these are the named env vars the CLI
loads from the project's `.env`:

| Env var                    | Default                                  | Purpose |
|----------------------------|------------------------------------------|---------|
| `AUTOHAND_API_URL`         | `https://api.autohand.ai`                | **Base URL knob** for Autohand's own telemetry/feedback server (the only global URL the CLI exposes) |
| `AUTOHAND_SECRET`          | *(required for feedback submission)*     | Company secret key for telemetry/feedback |
| `AUTOHAND_CONTEXT_COMPACT` | *(boolean; default `true`)*              | Enable/disable context compaction |
| `AUTOHAND_CONTEXT_WINDOW`  | *(token count; default unspecified)*     | Override context window size |
| `AUTOHAND_RESERVE_TOKENS`  | `16000`                                  | Reserve tokens for model output |

**This is the audit-critical base-URL knob for Autohand.**
The CLI honors `AUTOHAND_API_URL` for its own server,
which is the seam AO's Bifrost can route (redirect
Autohand's outbound telemetry/auth to Bifrost; OR
re-purpose the same shape for model traffic if Autohand
ever propagates provider base-URLs through the same
key, though current docs show that doesn't happen).

#### `src/config.ts` (direct-fetched from
`autohandai/code-cli/main/src/config.ts`)

Verified verbatim — every `process.env.*` read in the
config-loading module:

```
process.env.AUTOHAND_API_URL
process.env.AUTOHAND_SECRET
process.env.AUTOHAND_CONFIG                // path-to-config override

process.env.AZURE_OPENAI_KEY
process.env.AZURE_OPENAI_ENDPOINT
process.env.AZURE_OPENAI_DEPLOYMENT
process.env.AZURE_OPENAI_API_VERSION
process.env.AZURE_TENANT_ID
process.env.AZURE_CLIENT_ID
process.env.AZURE_CLIENT_SECRET

process.env.AWS_REGION
process.env.AWS_DEFAULT_REGION
```

Per-provider default base URLs in source literals
(`src/config.ts`):
```
const DEFAULT_BASE_URL        = "https://openrouter.ai/api/v1"
const DEFAULT_OLLAMA_URL      = "http://localhost:11434"
const DEFAULT_LLAMACPP_URL    = "http://localhost:8080"
const DEFAULT_OPENAI_URL      = "https://api.openai.com/v1"
const DEFAULT_MLX_URL         = "http://localhost:8080"
const DEFAULT_LLMGATEWAY_URL  = "https://api.llmgateway.io/v1"
const DEFAULT_ZAI_URL         = "https://api.z.ai/api/paas/v4"
const DEFAULT_SAKANA_URL      = "https://api.sakana.ai/v1"
const DEFAULT_DEEPSEEK_URL    = "https://api.deepseek.com"
const DEFAULT_BEDROCK_REGION  = "us-east-1"
```

`defaultBaseUrlFor(provider, port?)` also includes:
- `nvidia → https://integrate.api.nvidia.com/v1`
- `bedrock → https://bedrock-runtime.<region>.amazonaws.com`
  (Converse mode; or `/openai/v1` suffix for OpenAI-compat mode)

#### README `Supported Providers` table (direct-fetched)

The user-facing stable surface per the README is **9
named providers**:

```
| Provider     | Config Key |
|--------------|------------|
| OpenRouter   | openrouter |
| LLMGateway   | llmgateway |
| OpenAI       | openai     |
| AWS Bedrock  | bedrock    |
| DeepSeek     | deepseek   |
| Ollama       | ollama     |
| llama.cpp    | llamacpp   |
| MLX          | mlx        |
| Z.ai         | zai        |
```

#### Source-tree support (broader than README)

`src/providers/` directory lists **24+ provider classes**:

```
AzureClient.ts, AzureProvider.ts
BedrockProvider.ts
CerebrasClient.ts, CerebrasProvider.ts
CustomOpenAICompatibleProvider.ts
DeepSeekProvider.ts
LLMGatewayClient.ts, LLMGatewayProvider.ts
LLMProvider.ts
LlamaCppProvider.ts, MLXProvider.ts
NVIDIAClient.ts, NVIDIAProvider.ts
OllamaProvider.ts
OpenAIProvider.ts
OpenRouterClient.ts, OpenRouterProvider.ts
ProviderFactory.ts
SakanaProvider.ts
VertexAIProvider.ts                 ← Vertex AI
XAIProvider.ts                      ← xAI (Grok)
ZaiProvider.ts
customProviders.ts                  ← custom:
```

— adding **Cerebras**, **NVIDIA**, **Sakana**,
**Vertex AI**, **XAI (Grok)**, and a `CustomOpenAICompatibleProvider` /
`customProviders.ts` slot to the stable surface.

#### `customProviders.ts` (direct-fetched)

The Bifrost-shaped surface. Verified verbatim — `custom:`
prefix in provider id:

```ts
const CUSTOM_PROVIDER_PREFIX = "custom:";

export function normalizeCustomProviderId(input: string): string {
  return input.trim().toLowerCase()
    .replace(/^custom:/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCustomProviderConfig(
  config: Pick<AutohandConfig, "customProviders">,
  provider: ProviderName | string,
): CustomProviderSettings | undefined {
  const id = parseCustomProviderName(provider);
  if (!id) return undefined;
  const entry = config?.customProviders?.[id];
  if (!entry || entry.disabled === true) return undefined;
  return { ...entry, id };
}
```

— i.e. an Autohand user can add a `custom:my-bifrost`
entry under `config.customProviders.<id>` with their own
`baseUrl`/`apiKey`/`model`, and Autohand routes model
traffic through that custom provider via the
`CustomOpenAICompatibleProvider` glue.

This is **the explicit Bifrost seam** in the Autohand
codebase.

#### Per-provider env-var convention (the
NL-name → env mapping)

The autonomy of each provider's per-vendor env-var comes
from `src/providers/<Name>Client.ts` — each provider
class has its own client that reads the canonical env var
(`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, etc.) when
constructing API requests. Verbatim representative
extract from `DeepSeekProvider.ts`:

```ts
export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODELS = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-chat",
  "deepseek-reasoner",
];

export class DeepSeekProvider implements LLMProvider {
  constructor(config: DeepSeekSettings, networkSettings?: NetworkSettings) {
    const effectiveConfig: LLMGatewaySettings = {
      ...config,
      baseUrl: config.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL,
    };
    this.client = new LLMGatewayClient(effectiveConfig, networkSettings, {
      serviceName: "DeepSeek",
      credentialName: "DeepSeek API key",
      accountName: "DeepSeek account",
    });
    this.model = config.model;
  }
}
```

— i.e. **explicit `baseUrl ?? DEFAULT` resolution** in
each provider. If AO writes a custom config entry under
`config.providers.deepseek.baseUrl = "https://bifrost..."`,
Autohand's provider classes (via the
`CustomOpenAICompatibleProvider` factory) can be steered
to Bifrost. Same pattern is repeated per provider.

### Implication for AO provider gateway (Bifrost)

Autohand is **the fifth clean Bifrost route** in the
queue (after claude-code, continueagent, crush,
kilocode). It's the **richest** so far because the
cleanest path is:

1. **Custom provider entry** — write a
   `config.customProviders.bifrost` block to
   `~/.autohand/config.json` (or AOHOME fallback path)
   pointing at Bifrost's OpenAI-compatible endpoint,
   with the `custom:bifrost` prefix.
2. **Activate** — via the
   `CUSTOM_PROVIDER_PREFIX = "custom:"` lookup, the
   `CustomOpenAICompatibleProvider` factory wires the
   custom config in.
3. **Model selection** — `[--model <name>]` flag at
   launch controls which custom provider/model is used
   (consistent with autohand.go-mapped `defaultBaseUrlFor`).
4. **`AUTOHAND_API_URL` env var** — a **second seam**
   for routing Autohand's *own* telemetry/feedback server
   to Bifrost, but Bifrost is likely OpenAI-compat only,
   so this seam only matters if Bifrost also offers a
   telemetry-compatible API.

**No adapter change needed.** Autohand's adapter is
fully pass-through (single `APPDATA` Windows read at
`autohand.go:211`); Bifrost's gateway entry is a
config-file or env-var-only injection at runtime.

### Adapter changes needed for Bifrost

**None.** The adapter is already correct. Phase-2
gateway-writers only need to:

- (preferred) write a `custom:bifrost` entry under
  `config.customProviders` in `~/.autohand/config.json`
- (alt) set the per-provider `baseUrl` in-place via
  `config.providers.<name>.baseUrl`

Both paths land outside the adapter — no Go code change
in `autohand.go`.

### Open questions surfaced

- **`AUTOHAND_API_URL` is officially scoped to the
  telemetry path, not the model path.** AO's Bifrost
  could route telemetry into its `/api/autohand`
  shim, but if Bifrost is OpenAI-compat-only, this
  seam is out of scope. Surface flagged; not
  Phase-2-blocking.
- **`customProviders.ts` config-format details** —
  the `CustomProviderSettings` shape (referenced as
  imported type) wasn't direct-fetched this round.
  Surface flagged for Phase-2 followup if Bifrost
  adopts the `custom:` prefix.
- **`AUTOHAND_CONFIG` env var override** — useful
  for AO_HOME-friendliness (point Autohand's config
  loader at `$AO_HOME/autohand/config.json`).
  Surface flagged; Phase-2 followup.

## `devin` (Cognition "Devin for Terminal", binary `devin`, GitHub `CognitionAI/devin-cli`)

Source adapter:
`backend/internal/adapters/agent/devin/devin.go` (283 lines),
package `devin`, adapter ID `"devin"`,
+ `devin_test.go` (279 lines).

### Adapter self-description (verbatim)

> "Package devin implements the Devin ("Devin for Terminal",
> Cognition) agent adapter.
>
> Devin for Terminal (binary "devin") is Cognition's terminal
> coding agent. It has a documented Claude Code compatibility
> layer: it imports `.claude/` configuration (commands,
> subagents, and Claude Code lifecycle hooks), storing the
> converted hooks in `.devin/hooks.v1.json`. Because of this,
> AO reuses the Claude Code hook installer (which writes
> .claude/settings.local.json with AO hook commands) and
> Devin picks them up via its compat layer. This makes Devin
> a Tier B (Claude-compat) adapter, mirroring the grok
> adapter.
>
> Launch uses `-p <prompt>` for the initial task in
> non-interactive/print mode (in-command delivery).
> Permission handling uses `--permission-mode`, whose valid
> values are `normal` (aliases: auto) and `dangerous`
> (aliases: yolo, bypass). AO's four permission modes are
> mapped onto these two: Default emits no flag, AcceptEdits/
> Auto map to `auto`, and BypassPermissions maps to
> `dangerous`.
>
> Restore prefers the hook-captured native session id via
> `-r <id>`."
> — `devin.go:1-22`

Launch argv (`devin.go:86-100`):

```
devin [--permission-mode <mode>] -p <prompt>
```

Restore argv (`devin.go:135-154`):

```
devin [--permission-mode <mode>] -r <agentSessionId>
```

Approval mapping (`devin.go:253-266`):

| AgentOps mode         | Devin argv fragment |
|-----------------------|---------------------|
| `Default`             | *(no flag — defer to `~/.config/devin/config.json` default mode)* |
| `AcceptEdits`         | `--permission-mode auto` |
| `Auto`                | `--permission-mode auto` |
| `BypassPermissions`   | `--permission-mode dangerous` |

Hook installation (`devin.go:125-130`) is delegated
**directly** to the `claudecode.Plugin`:

```go
func (p *Plugin) GetAgentHooks(...) error {
    return (&claudecode.Plugin{}).GetAgentHooks(ctx, cfg)
}
```

— i.e. Devin re-uses Claude Code's `.claude/settings.local.json`
hook installer because the binary's
`config-importers/.../claude` + `agent-ext/hooks/importers/claude`
layer converts Claude-compat hooks (SessionStart,
UserPromptSubmit, Stop, PermissionRequest, SessionEnd, ...)
on load (verbatim, `devin.go:111-124`). Devin is therefore
in AO's "tooling group" `claude-code` in `cli/hooks.go`
(same as the adapter doc claims).

### Env-var surface — adapter itself

**Zero env reads / writes.** Confirmed with a recursive grep
over `devin.go`:

```
grep "os.Getenv\|os.LookupEnv" backend/internal/adapters/agent/devin/devin.go
→ (no matches)
```

The only `os.*` touches are `os.UserHomeDir()` for binary-path
candidates (`devin.go:191, 215`) and `os.Stat()` for
file-exists checks (`devin.go:281-283`). **No AO-gateway
env knobs.**

Binary resolution is hard-coded to `devin.cmd`, `devin.exe`,
`devin` (Windows); `/usr/local/bin/devin`,
`/opt/homebrew/bin/devin`,
`~/.devin/bin/devin`,
`~/.local/bin/devin` (POSIX).
(`devin.go:181-220`.)

### Env-var surface — Devin CLI proper (closed-source)

The CLI's source repo is minimal. `CognitionAI/devin-cli`
(a public GitHub repo) holds only:

```
.github/workflows/release-from-manifest.yml
README.md
scripts/release_from_manifest.py
```

— i.e. `devin-cli` is a **manifest stub** that points users
back at the docs (`README.md` is effectively: "Try Devin CLI:
https://docs.devin.ai/cli"). The actual binary is published
**separately** and is closed-source. This matches the
closed-source pattern already audited for `cursor`, `amp`,
and `auggie`.

#### `https://docs.devin.ai/cli` (direct-fetched 2026-07-03)

Direct-fetched via WebFetch. The page lists install
steps and 4 "What's next" cards (Essential Commands,
Models, Extensibility, Command Reference) but
**does not name any env vars related to provider
routing** (no `DEVIN_API_KEY`, no `DEVIN_BASE_URL`,
no `OPENAI_*`, no `ANTHROPIC_*`). Page verdict: empty.

#### `https://docs.devin.ai/cli/models` (direct-fetched 2026-07-03)

Quoted verbatim from page:

> "Devin CLI supports multiple AI models. You can choose
> the best model for your task to optimize for maximum
> capability, speed, or cost efficiency.
>
> Adaptive — For most users, we recommend **Adaptive** —
> our intelligent model router that automatically selects
> the best model for each task...
>
> Models release frequently. We typically support the
> latest and greatest models from **Anthropic**,
> **OpenAI**, **Google**, and **Cognition**...
>
> Short names like `opus`, `sonnet`, `swe`, `codex`,
> and `gemini` always resolve to the latest version in
> that model family.
>
> Some models support configurable reasoning levels...
> You can cycle the thinking level with `Alt+T` (macOS:
> `Opt+T`) during a session.
>
> Setting the Model — command-flag tab:
> `devin --model opus -- refactor this module`
> `devin --model sonnet -- explain this code`
>
> Slash command tab:
> `/model opus`
> `/model sonnet`
> `/model codex`
> Run `/model` with no argument to open the model
> selector.
>
> Config-file tab:
> Set a default in `~/.config/devin/config.json` (on
> Windows, `%APPDATA%\devin\config.json`):
> `"agent": { "model": "swe-1-6-fast" }`"

**No environment variables**, **no BYOK section**,
**no `/config` interactive route** beyond the model
selector, **no auth/credentials mechanism** beyond the
slash commands `/login` and `/logout`. Confirmed by WebFetch
agent's explicit tail: "No environment variables,
BYOK, authentication, `/config` route, or `/model` route
beyond what is quoted above are present on this page."

#### `https://docs.devin.ai/cli/essential-commands` (direct-fetched 2026-07-03)

Quoted verbatim — only env-var-adjacent text:

> "`/login` Authenticate with Devin
>  `/logout` Clear stored credentials and exit"

— i.e. **auth is via `/login` slash command, not an env
var**. The page does not reference `DEVIN_API_KEY`,
`DEVIN_API_TOKEN`, or any token-via-environment mechanism.

#### `https://docs.devin.ai/llms.txt` (direct-fetched 2026-07-03)

The site's flat-text LLM-friendly index. Hasn't surfaced
**any** path named `cli/configuration` or `cli/env-vars`
or `cli/api-keys`. All CLI subpages point at **commands,**
**models,** **extensibility,** and the **command reference**.
No configuration reference exists at the URL surface
`/docs.devin.ai/cli/configuration` — confirmed by a
WebFetch that returned **HTTP 404**.

#### `devin` source repo (`CognitionAI/devin-cli`)

GitHub-side file-tree probe (`gh api repos/CognitionAI/
devin-cli/git/trees/main?recursive=1`): only 4 files
(`.github/...`, `README.md`, `scripts/...`). **No source.**

Adapter-side, this means there's literally no upstream
code-level audit surface — only the docs.

### Implication for AO provider gateway (Bifrost)

**Negative finding.** Devin ships:

1. **No env knob** for provider base-URL.
2. **No env knob** for API key override.
3. **No env knob** for model override (only CLI flag
   `--model` or config-file `agent.model`).
4. **No public base-URL knob** anywhere in
   `docs.devin.ai` (the docs page did not surface
   one in any reachable URL).
5. **Adapter is fully pass-through** — zero env-touches.

The page mentions **"Adaptive"** as an internal
router that "automatically selects the best model for
each task" — i.e. the model-pick is delegated to
Cognition's backend, **not** the user. There is no
public docs surface to influence that router through
env vars or CLI flags. (No evidence base exists for
the WebSearch-shaped claim that the SDK env knobs
`ANTHROPIC_BASE_URL`, `OPENAI_API_BASE`,
`OPENROUTER_API_KEY` are inherited; no doc page lists
these, and the binary is closed-source.)

### Adapter changes needed for Bifrost

**None.** The adapter is already correct. Modelling
Devin's surface as a negative finding means a future
"AO gateway configuration page" can list Devin as
"provider-routing not yet supported" without forcing
the adapter through a forked path.

### Open questions surfaced

- **`/docs.devin.ai/cli/configuration` is 404.** Some
  user-facing config-file reference exists at
  `~/.config/devin/config.json` (referenced from the
  model page), but the closed-source binary may
  support more fields than docs publish. To know for
  sure would require running the binary locally with
  `--help-all`-style introspection. Out of autonomous
  loop.
- **The Anthropic Claude Code compat layer** does not
  imply that Devin reads `ANTHROPIC_*` — the devin.go
  doc says *config* is imported (commands, subagents,
  hooks), not SDK env knobs. Negative finding stands
  unless binary introspection says otherwise.
- **`DEVIN_API_KEY` for enterprise** is referenced
  via `docs.devin.ai/api-reference/authentication.md`
  (in `llms.txt`). That key authenticates to the
  **Devin API** (`api.devin.ai`), not the CLI's
  model traffic — i.e. it would not help route the
  CLI's `--model <name>` calls through Bifrost.




