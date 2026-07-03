# Decision Log

Scannable log of every architecture decision made for this fork so far.
Each entry links to the RFC with full reasoning and to the research
findings section it rests on. Decisions here are current; if one changes,
update it in place and note the change — don't leave stale decisions
standing.

| # | Decision | RFC | Findings ref |
| - | -------- | --- | ------------- |
| 1 | Introduce `AO_HOME` as a single, additive root-directory override. Default stays `$HOME/.ao` — no behavior change for anyone not setting it. `AO_DATA_DIR`/`AO_RUN_FILE` keep winning when set explicitly. | [001](rfcs/001-ao-home-portability.md) | §8, §11 Phase 1 |
| 2 | Provider/LLM gateway: run [Bifrost](https://github.com/maximhq/bifrost) as a Go-native **sidecar process** (not embedded in-process, not a Python litellm subprocess). AO's daemon supervises it but keeps provider credentials/LLM traffic out of the loopback, no-auth daemon itself. | [002](rfcs/002-provider-gateway-architecture.md) | §9, §10 |
| 3 | Guardian's scope narrows back to local model serving + queuing (its original purpose) and becomes one backend configured *inside* Bifrost. Guardian no longer needs its own Anthropic↔OpenAI bridge for this fork's purposes. | [002](rfcs/002-provider-gateway-architecture.md) | §10 (fork-in-the-road, stacking assessment) |
| 4 | Provider priority: Anthropic, AWS Bedrock, GCP Vertex, NVIDIA, OpenRouter, Guardian — all reachable through the single Bifrost endpoint. | [002](rfcs/002-provider-gateway-architecture.md) | §10 decision 2 |
| 5 | Wizard/setup UX lives in the **dashboard** (Electron/React), not CLI-only. A CLI counterpart may exist alongside it. | [005](rfcs/005-web-dashboard-ux.md) | §10 decision 3 |
| 6 | No kingpin-mode / cross-framework host orchestration wiring. This fork stays focused on AO itself. | — | §10 decision 4 |
| 7 | AO's existing "self-improving orchestrator" RFC does **not** cover any of the work in this fork (auto-detect/install, capability registry, providers, skills). That RFC is unmerged, drafted against AO's old TypeScript codebase, and scoped only to AO diagnosing bugs in its own runtime. | [003](rfcs/003-framework-capability-registry.md), [006](rfcs/006-modular-architecture.md) | §12 |
| 8 | `ao doctor` is the right home for **health-checking external capabilities** this fork adds (providers, MCP servers, installed frameworks) — not a second loop competing with `diagnose`. | [006](rfcs/006-modular-architecture.md) | §12 |
| 9 | Adopt **module-as-convention** (a bounded package per domain concern: own config, own doctor checks, own HTTP surface, own dashboard section) starting now, starting with exactly one module: `internal/providers/`. Do **not** build a generic module/plugin framework, and do **not** retrofit existing scattered code (e.g. security) into a module speculatively. | [006](rfcs/006-modular-architecture.md) | §12 |
| 10 | Skills/tools should work **across every framework AO manages**, not siloed per adapter. Build on the existing `SKILL.md` convention (already used elsewhere on this host) with a per-adapter translation step, falling back to system-prompt injection for adapters with no native extension mechanism. | [004](rfcs/004-cross-framework-skills-and-tools.md) | §14.2 |
| 11 | Shared MCP servers (SearXNG first) run **once**, physically stored under `AO_HOME`, and get registered into every adapter's own config — the concrete first case of decision 10's translation layer, and likely the second real module (crossing the "≥2 modules" threshold from decision 9). | [004](rfcs/004-cross-framework-skills-and-tools.md) | §14.4 |

## Open questions (decisions not yet made)

| # | Question | Blocks | Findings ref |
| - | -------- | ------ | ------------- |
| A | What does "controlled environment" mean concretely for auto-installing agent CLIs and skill-dependent services (SearXNG etc.)? Disposable worktree, opt-in `--install` flag with dry-run preview, something else? | [003](rfcs/003-framework-capability-registry.md) auto-install work | §12 |
| B | Is "web GUI" (a) the existing Electron-hosted dashboard, redesigned to be far more intuitive, or (b) literally reachable from a plain browser without the Electron shell (needs a CORS-trust + static-serving change, still loopback-only)? | [005](rfcs/005-web-dashboard-ux.md) design | §14.1 |
| C | When `AO_HOME` points at a path that does not exist yet, should AO **create** it (e.g. `os.MkdirAll(..., 0o700)`, mirroring the existing `runfile.Write` and `ptyregistry.writeRaw` patterns) or **error** and let the operator create it themselves? | [001](rfcs/001-ao-home-portability.md) writing paths under AO_HOME, downstream RFC 002 sidecar data dir | RFC 001 §"Decision" silent, TODO.md "Decide:" item |

Nothing in this log is implemented yet.
