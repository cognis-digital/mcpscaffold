# Roadmap

`mcpscaffold` generates conformant, typed, tested Model Context Protocol (MCP)
servers from a single spec file, validates specs as a CI gate, and (as of this
release) checks two spec revisions for backward-compatibility. This document
describes the direction; it is intentionally conservative — every item must
preserve the project's guarantees: **zero runtime dependencies, pure/testable
generation, and defensive-only scope.**

## Guiding principles

- **Spec-driven.** A `ServerSpec` is the single source of truth. Everything —
  generation, validation, diffing, docs — derives from it.
- **Zero runtime dependencies.** Generated servers and the library run on Node
  built-ins alone. New features may add *dev* dependencies only when the value
  is overwhelming.
- **Pure where possible.** Generation and analysis are pure functions returning
  data; only the thin `scaffold*` writers touch the filesystem. This keeps the
  surface unit-testable.
- **Defensive scope.** Sample tools are read-only; the auth hook is
  allow-with-TODO, never a bypass.
- **Additive & backward-compatible.** The library's public exports and the CLI's
  commands are a contract. New capability is added alongside, never in place of,
  existing behavior.

## Near-term (next few releases)

- **Compatibility gate in CI recipes.** Ship a documented pattern (and example
  workflow) that runs `mcpscaffold diff <previous> <current>` on pull requests
  and fails when a breaking change lands without a major version bump.
- **`diff` deepening.** Compare `outputSchema` types, enum narrowing/widening
  (narrowing an input enum is breaking; widening is compatible), and resource
  `mimeType` changes with finer classification.
- **Richer `list` output.** A `--json` mode for `list` symmetric with
  `validate --json`, for tooling that wants a normalized inventory.
- **Spec authoring ergonomics.** A `check` mode that runs `validate` plus a set
  of lint-style advisories (missing `title`, missing tool `annotations`,
  prompts without descriptions) that warn without failing.

## Mid-term

- **More JSON Schema keywords** in the dependency-free validator where they are
  common in MCP tool inputs: `minimum`/`maximum`, `minLength`/`maxLength`,
  `pattern`, `additionalProperties: false`. Each added behind the same
  well-formed-schema checks so validation stays predictable.
- **Pluggable generator targets.** Keep the emitted server on Node built-ins,
  but allow an alternate emitter (e.g. a single-file bundle) selected by a flag,
  reusing the same pure `generateServerFiles` core.
- **Golden-file regeneration test.** A committed snapshot of the generated
  project for `EXAMPLE_SPEC`, diffed in CI so generation changes are reviewed
  intentionally.

## Long-term

- **HTTP transport option (opt-in).** The current scope is stdio only. A
  streamable-HTTP transport generator would be a deliberate, well-tested
  addition — including a real (not stubbed) auth path, since HTTP carries the
  headers the bearer example needs.
- **Capability negotiation depth.** Optional pagination and `listChanged`
  notifications for servers that need them, gated by spec flags so simple
  servers stay simple.
- **Conformance corpus.** A suite of specs exercising edge cases (unicode names,
  large catalogs, deeply nested schemas) run against generated servers to guard
  the spec-conformance promise over time.

## Explicitly out of scope

Consistent with the defensive charter: no offensive tooling, no credential
harvesting, and no generation of tools that perform destructive actions by
default. Sampling/elicitation and client-side features remain out of scope; this
project builds and validates *servers*.
