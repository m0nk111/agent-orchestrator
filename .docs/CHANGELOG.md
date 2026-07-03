# CHANGELOG — autonomous fork loop

This file records what each autonomous loop iteration landed on
`fork/ao-home-and-providers`. Newest entry on top.

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
