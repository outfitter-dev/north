# Phase 6: Doctor & Polish

**Timeline:** 2-3 days  
**Status:** Pending

## Goal

`north doctor` full health check, polish CLI UX.

## Overview

This phase completes the `north doctor` command (started in Phase 1) and polishes the overall CLI experience. By the end, external developers can adopt North in under 10 minutes.

## Tasks

### 6.1 Doctor Command (extended)

Building on Phase 1's primitive doctor:
- [ ] Index freshness check (git tree hash comparison)
- [ ] Compatibility version tracking (shadcn, Tailwind)
- [ ] Token sync validation (--color-* ↔ shadcn aliases)
- [ ] `--fail-on-drift` for CI
- [ ] Orphan token detection

### 6.2 CLI Polish

- [ ] Consistent output formatting (box drawing, colors)
- [ ] Progress indicators
- [ ] `--help` for all commands
- [ ] `--verbose` and `--quiet` flags
- [ ] `north context` for LLM injection
- [ ] `north context --compact` for system prompts

### 6.3 Documentation

- [ ] README with quick start
- [ ] CLI help text
- [ ] Run through `examples/nextjs-shadcn` as integration test

## Exit Criteria

- External developer can adopt North in <10 minutes
- `north doctor` catches all common configuration issues
- All commands have consistent formatting and help text
- `north context` provides useful LLM context
- Documentation covers basic usage patterns

## Key Details

### Doctor Command Extensions

**Index freshness:**
- Compare git tree hash (fast) or file content hash (fallback)
- Warn if index is stale
- `--fail-on-drift` makes CI fail on stale index

**Compatibility tracking:**
- Detect shadcn version
- Detect Tailwind version
- Warn about incompatibilities

**Token sync validation:**
- Ensure `--color-*` tokens align with shadcn semantic names
- Catch drift between North config and shadcn conventions

**Orphan detection:**
- Find tokens defined but never used
- Find tokens used but not defined

### CLI Polish

**Consistent formatting:**
- Use chalk for colors
- Box drawing for structured output
- Clear section headers
- Scannable summaries

**Progress indicators:**
- Use ora for long-running operations
- Clear progress messages
- Estimated time remaining for index builds

**Context command:**
- `north context` — full design system context for LLM
- `north context --compact` — minimal version for system prompts
- JSON output for programmatic consumption

### Documentation

Write for the developer who's never seen North before:
- Quick start in README
- Clear example workflows
- Troubleshooting section
- Link to full spec docs

## Dependencies

- **Requires:** Phase 3 (Index & Analysis)
- **Enhanced by:** Phase 4 (Discovery), Phase 5 (Evolution)

## Cross-References

### Spec Documents

- [15-drift-detection.md](../spec/15-drift-detection.md) - Freshness validation
- [06-agent-workflow.md](../spec/06-agent-workflow.md) - LLM context injection
- [10-cli-architecture.md](../spec/10-cli-architecture.md) - Command structure
- [17-adoption-paths.md](../spec/17-adoption-paths.md) - User onboarding

### Related Phases

- **Requires:** Phase 3 (Index & Analysis)
- **Enhanced by:** Phase 4 (Discovery), Phase 5 (Evolution)
- **Completes:** v0.1 release

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Doctor checks too slow | Optimize git tree hash usage, cache where safe |
| Version detection brittle | Handle missing/unexpected versions gracefully |
| Context command output too verbose | Provide --compact flag, tune default verbosity |
| Documentation incomplete | Test with fresh developer, fill gaps they hit |

## Notes

- Doctor command is essential for debugging - invest in good error messages
- Context command enables LLM workflows (key differentiator)
- Polish matters - first impression determines adoption
- Test onboarding with someone who hasn't seen North before
- Consistent formatting across all commands (don't let it diverge)

## Success Metrics

**v0.1 is successful if:**

1. `npx @outfitter/north init` works in fresh Next.js + shadcn project
2. `north gen` produces valid Tailwind v4 CSS
3. `north check` catches raw palette and arbitrary values
4. `north find --cascade` traces a real styling issue
5. Docs sufficient for self-serve setup
