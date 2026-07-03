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
- [ ] `aider`, `amp`, `auggie`, `autohand`, `cline`, `codex`, `continueagent`, `copilot`, `crush`, `cursor`, `devin`, `droid`, `goose`, `grok`, `kilocode`, `kimi`, `kiro`, `pi`, `qwen`, `agy`, `vibe` — to do in follow-up iterations.

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
