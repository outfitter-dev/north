# Phase 0: Scaffolding

**Timeline:** 1-2 days  
**Status:** Pending

## Goal

Monorepo exists, tooling configured, CI green.

## Overview

This phase establishes the foundation for North development. By the end of this phase, the monorepo structure will be in place with all tooling configured and a basic CLI entrypoint working.

## Tasks

- [ ] Initialize monorepo with Bun workspaces
- [ ] Configure Turborepo
- [ ] Set up Biome + Ultracite
- [ ] Configure Lefthook
- [ ] Set up GitHub Actions (lint, test)
- [ ] Create `packages/north` structure
- [ ] Basic CLI entrypoint (`north --version`)
- [ ] **Create `examples/nextjs-shadcn` as workspace package** — dogfood playground from day 1
- [ ] Publish placeholder to npm

## Exit Criteria

- `npx @outfitter/north --version` works
- `bunx @outfitter/north --version` also works as fast path
- CI pipeline runs successfully (lint, test)
- Example project exists in workspace for immediate dogfooding

## Key Details

### Dogfood Immediately

Don't mock the filesystem. Use `examples/nextjs-shadcn` as a live integration test bench. Run `north gen` against real files during development.

### Monorepo Structure

See [PLAN.md](../../PLAN.md) for the complete monorepo structure. Key directories:

- `packages/north/` - Main CLI package
- `examples/nextjs-shadcn/` - Dogfood playground (workspace package)
- `.github/workflows/` - CI configuration

## Dependencies

**None** - This is the foundation phase

## Cross-References

### Spec Documents

- [01-overview.md](../spec/01-overview.md) - Project overview
- [10-cli-architecture.md](../spec/10-cli-architecture.md) - CLI command structure
- [13-project-structure.md](../spec/13-project-structure.md) - Package organization

### Related Phases

- **Leads to:** Phase 1 (Config & Generation)

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Tooling configuration conflicts | Use Ultracite for shared Biome config, follow established patterns |
| Workspace resolution issues | Test with both Bun and npm to ensure compatibility |
| CI/CD setup complexity | Start with minimal workflow, expand as needed |

## Notes

- Package manager is Bun 1.1.0+
- Use `better-sqlite3` from the start (native module decision already made)
- Keep initial CLI simple - just version command to prove deployment works
