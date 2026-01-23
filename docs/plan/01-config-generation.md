# Phase 1: Config & Generation

**Timeline:** 3-4 days  
**Status:** Pending

## Goal

`north init` and `north gen` work end-to-end.

## Overview

This phase implements the configuration system and token generation engine. By the end, users can initialize North in their project and generate Tailwind v4 CSS from dial configurations.

## Tasks

### 1.1 Config System

- [ ] Define `.north/config.yaml` schema (TypeScript types + runtime validation)
- [ ] Zod schema for config validation (TS types alone won't guard user YAML)
- [ ] Config loader with validation
- [ ] `extends` resolution (local files, npm packages, registry URLs; last-wins merge)
- [ ] Dial defaults

### 1.2 Token Generation

- [ ] Dial → token value computation
- [ ] CSS generation (Tailwind v4 `@theme` format)
- [ ] OKLCH color handling
- [ ] Generated file with checksum header

### 1.3 Init Command

- [ ] `north init` scaffolds `.north/` directory
- [ ] Creates default `.north/config.yaml`
- [ ] Creates `.north/tokens/base.css`
- [ ] Runs initial `north gen`

### 1.4 Primitive Doctor (debugging aid)

- [ ] `north doctor` — basic config validation
- [ ] "Config loaded successfully" / "Config error at line X"
- [ ] Checksum verification for generated files
- [ ] Helps debug "why isn't my config loading?" during dev

## Exit Criteria

- `north init && north gen` produces valid Tailwind v4 CSS
- Generated CSS includes proper checksum header
- Config validation catches common errors with helpful messages
- `north doctor` confirms config loads successfully

## Key Details

### Config Schema

The config uses YAML with Zod validation at runtime. This provides both TypeScript types for development and runtime safety for user-provided configs.

### Token Generation

Dials are abstract configuration values that map to concrete token values. The generation process:

1. Load config with dial values
2. Compute token values from dials
3. Generate CSS in Tailwind v4 `@theme` format
4. Add checksum header for integrity verification
5. Handle OKLCH color space properly

### Primitive Doctor

Start building the doctor command early as a debugging aid during development. Initial version just validates config loads and checks checksums.

## Dependencies

- **Requires:** Phase 0 (Scaffolding)

## Cross-References

### Spec Documents

- [02-dials.md](../spec/02-dials.md) - Dial system architecture
- [03-token-architecture.md](../spec/03-token-architecture.md) - Token structure and generation
- [05-tailwind-vocabulary.md](../spec/05-tailwind-vocabulary.md) - Tailwind v4 integration
- [10-cli-architecture.md](../spec/10-cli-architecture.md) - CLI commands
- [14-configuration.md](../spec/14-configuration.md) - Config file format

### Related Phases

- **Requires:** Phase 0 (Scaffolding)
- **Leads to:** Phase 2 (Linting), Phase 3 (Index)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| YAML parsing edge cases | Use well-tested YAML library, comprehensive validation |
| Color space math complexity | Follow OKLCH spec closely, test with known values |
| Config validation error messages unclear | Invest in helpful error formatting early |
| Checksum format incompatibility | Document format clearly, version it if needed |

## Notes

- Config is the source of truth for the entire system
- Generated files are derived artifacts (can be regenerated)
- `extends` resolution supports local files, npm packages, and registry URLs; later layers win
- Keep dial system simple initially - can expand later
