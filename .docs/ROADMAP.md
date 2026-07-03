# Roadmap

Phased, sequenced implementation plan across every decision in
[`DECISIONS.md`](DECISIONS.md). Each phase links to its RFC for the full
detail. Nothing below is implemented yet.

## Phase 1 — `AO_HOME` single-directory portability

Small, mechanical, fully unblocked. See
[RFC 001](rfcs/001-ao-home-portability.md) for the exact file list. Do this
first — it has zero open questions and zero dependencies on anything else
in this roadmap.

**Status (2026-07-03): landed on `fork/ao-home-and-providers`.** Code
+ tests for the four code surfaces (`backend/internal/config`,
`backend/internal/adapters/runtime/conpty/ptyregistry`,
`frontend/src/main.ts`, `frontend/src/shared/telemetry.ts`,
`frontend/src/shared/daemon-discovery.ts`) plus docs (`AGENTS.md`,
`frontend/src/landing/content/docs/cli.mdx`, `README.md`) are on the
branch. Open question C in [`DECISIONS.md`](DECISIONS.md)
(`AO_HOME`-on-missing → create vs. error) is the one residual
non-mechanical item; the rest of Phase 1 is end-to-end exercised in
tests on Linux. Full iteration record in
[`.docs/CHANGELOG.md`](CHANGELOG.md).

## Phase 2 — Provider gateway (Bifrost) as the first module

1. Per-adapter env var audit — which env vars each agent CLI (`opencode`,
   `aider`, `claude-code`, …) reads for a custom base URL/API key.
2. Stand up `internal/providers/` as the first real domain module (per
   [RFC 006](rfcs/006-modular-architecture.md)): Bifrost config generation,
   sidecar process supervision, credential storage.
3. Extend `ao doctor` with Bifrost reachability + credential-presence
   checks, owned by the new module, exposed over a new HTTP route so the
   dashboard can show the same signal.
4. See [RFC 002](rfcs/002-provider-gateway-architecture.md) for the full
   Bifrost/Guardian layering.

## Phase 3 — Framework capability registry

1. Extend `ao doctor` from 2 to all 23 agent adapters (mechanical — each
   adapter already has a `Resolve<X>Binary`-equivalent).
2. Resolve open question A (`DECISIONS.md`) — what "controlled environment"
   means for auto-install — before writing any install code.
3. Stand up the per-framework capability/extension registry as an ongoing
   maintenance process (not a runtime feature).
4. See [RFC 003](rfcs/003-framework-capability-registry.md).

## Phase 4 — Cross-framework skills and tools (SearXNG/MCP first)

1. Stand up the shared SearXNG MCP server under `AO_HOME`.
2. Build the per-adapter MCP registration step (the concrete first case of
   the general skill-translation layer).
3. This is likely the second real module — once it exists, the shared
   doctor-check aggregator from RFC 006 is worth building.
4. General skill-format translation (`SKILL.md` → per-adapter native
   mechanism or prompt-injection fallback) follows once the MCP case is
   proven.
5. See [RFC 004](rfcs/004-cross-framework-skills-and-tools.md).

## Phase 5 — Dashboard wizard UX

1. Resolve open question B (`DECISIONS.md`) — Electron-hosted redesign vs.
   plain-browser-reachable — before designing.
2. Build the wizard once Phases 2-4 give it real signal to display
   (doctor results, provider status, installed frameworks, available
   skills/MCP servers). Building the UI before the backend signal exists is
   explicitly out of order.
3. Add the first env-editing UI to `ProjectSettingsForm.tsx` (a gap that
   exists today regardless of any other decision here).
4. See [RFC 005](rfcs/005-web-dashboard-ux.md).

## Ordering rationale

Phase 1 before everything: smallest, zero dependencies. Phases 2-4 before
Phase 5: the wizard's entire value is surfacing signal that doesn't exist
yet — building it first would mean building UI against nothing. Phase 2
before Phase 3/4: standing up the first module (`internal/providers/`)
establishes the module convention (RFC 006) that Phases 3-4 then reuse
rather than each re-deciding how to structure their own package.
