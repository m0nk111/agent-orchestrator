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
- [ ] Windows path handling: verify `AO_HOME` with drive letters / backslashes resolves correctly in `filepath.Join` calls

### Frontend (Electron)
- [ ] `frontend/src/main.ts`: `app.setPath("userData", …)` reads `AO_HOME` before falling back to `os.homedir()`
- [ ] Verify `process.env.AO_HOME` is actually readable at the point `app.setPath` is called (before `app.ready`) — confirm no Electron env-loading order issue
- [ ] `frontend/src/shared/telemetry.ts`: `defaultDataDir()` adds an `AO_HOME` tier ahead of `$HOME/.ao/data`
- [ ] `frontend/src/shared/daemon-discovery.ts`: `defaultRunFilePath()` actually wires in its currently-unused `_env` parameter to check `AO_HOME`

### Tests
- [ ] `config_test.go`: `AO_HOME` alone → used; `AO_HOME` + `AO_DATA_DIR` both set → `AO_DATA_DIR` wins; neither set → `$HOME/.ao`
- [ ] `ptyregistry_test.go`: same precedence, Windows-registry-specific
- [ ] `telemetry.test.ts`: `defaultDataDir` precedence including `AO_HOME`
- [ ] `daemon-discovery.test.ts`: `defaultRunFilePath` precedence including `AO_HOME`
- [ ] Cross-platform smoke: `AO_HOME` override exercised on Linux, macOS, Windows (CI matrix or manual)

### Docs
- [ ] `AGENTS.md`: update the "All app state lives under `~/.ao` only" hard rule to mention `AO_HOME`
- [ ] `frontend/src/landing/content/docs/cli.mdx`: add an `AO_HOME` row to the env var table
- [ ] Explicitly document: existing installs are unaffected (default path unchanged) — no migration needed
- [ ] `README.md` / quickstart: check for any other `~/.ao` mentions that need the same note

---

## Phase 2 — Provider gateway ([RFC 002](rfcs/002-provider-gateway-architecture.md)) — first module ([RFC 006](rfcs/006-modular-architecture.md))

### Research (do first, blocks everything else in this phase)
- [ ] Per-adapter env var audit: for each of the 23 adapters, document which env var(s) its underlying CLI reads for a custom base URL / API key / model override (table: adapter id → base-URL var → API-key var → model var → notes). Start with `opencode` (Guardian-style pattern already used elsewhere on this host), then `claude-code` (`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_MODEL`, already confirmed), then work through the rest: `aider`, `amp`, `auggie`, `autohand`, `cline`, `codex`, `continueagent`, `copilot`, `crush`, `cursor`, `devin`, `droid`, `goose`, `grok`, `kilocode`, `kimi`, `kiro`, `pi`, `qwen`, `agy`
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
