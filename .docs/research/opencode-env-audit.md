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
- [ ] `claude-code` — TODO claims `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` already confirmed; to be verified against the Claude Code binary's own docs as a follow-up.
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
