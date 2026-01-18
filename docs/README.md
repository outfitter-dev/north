# North Documentation

Welcome to the North documentation. This directory contains comprehensive documentation for the North design system CLI.

## Documentation Structure

### [Specification (`spec/`)](./spec/)

**What North is** - Architecture, features, and design decisions.

The specification documents describe North's architecture, token system, linting rules, and all features in detail. Start here to understand what North does and how it works.

**Key documents:**
- [Overview](./spec/01-overview.md) - Project goals and scope
- [Dials](./spec/02-dials.md) - Configuration abstraction system
- [Token Architecture](./spec/03-token-architecture.md) - Token structure and generation
- [CLI Architecture](./spec/10-cli-architecture.md) - Command structure
- [Index Architecture](./spec/11-index-architecture.md) - SQLite index design

[Browse all spec docs →](./spec/)

### [Implementation Plan (`plan/`)](./plan/)

**How to build it** - Phased implementation roadmap.

The plan documents break North's development into 7 phases with clear tasks, dependencies, and exit criteria. Use these to understand the build order and track progress.

**Phases:**
1. [Scaffolding](./plan/00-scaffolding.md) (1-2 days)
2. [Config & Generation](./plan/01-config-generation.md) (3-4 days)
3. [Linting](./plan/02-linting.md) (4-5 days)
4. [Index & Analysis](./plan/03-index-analysis.md) (5-7 days)
5. [Discovery Tools](./plan/04-discovery-tools.md) (5-7 days)
6. [Evolution Tools](./plan/05-evolution-tools.md) (4-5 days)
7. [Doctor & Polish](./plan/06-doctor-polish.md) (2-3 days)

[Browse implementation plan →](./plan/)

## Quick Links

### Root Documents

- [`/OVERVIEW.md`](../OVERVIEW.md) - Project introduction
- [`/PLAN.md`](../PLAN.md) - Quick reference implementation plan
- [`/README.md`](../README.md) - Repository README

### For Contributors

- Start with [Specification Overview](./spec/01-overview.md) to understand North's goals
- Review [Phase 0: Scaffolding](./plan/00-scaffolding.md) for development setup
- Check [CLI Architecture](./spec/10-cli-architecture.md) for command structure
- See [Index Architecture](./spec/11-index-architecture.md) for data model

### For Users

- See [`/README.md`](../README.md) for installation and quick start
- Check [CLI Architecture](./spec/10-cli-architecture.md) for available commands
- Review [Agent Workflow](./spec/06-agent-workflow.md) for AI integration

## Navigation

```
north/
├── docs/
│   ├── README.md (you are here)
│   ├── spec/         → What North is
│   │   ├── README.md
│   │   ├── 01-overview.md
│   │   ├── 02-dials.md
│   │   └── ... (23 spec documents)
│   └── plan/         → How to build it
│       ├── README.md
│       ├── 00-scaffolding.md
│       ├── 01-config-generation.md
│       └── ... (7 phase documents)
├── OVERVIEW.md       → Project introduction
├── PLAN.md           → Quick reference plan
└── README.md         → Repository README
```

## Document Types

### Specification Documents
Describe **what** North is: architecture, features, design decisions, and rationale. These are relatively stable and change only when North's design changes.

### Plan Documents
Describe **how** to build North: implementation phases, tasks, dependencies, and exit criteria. These track progress and guide development.

### Root Documents
High-level project information: overview, quick start, and quick reference versions of key docs.

## Contributing

When adding documentation:
- **Spec changes:** Update relevant spec documents when architecture or features change
- **Plan updates:** Mark tasks complete, add discovered tasks, update estimates
- **New features:** Add spec doc first (what), then plan tasks (how)
- **Cross-references:** Link between spec and plan docs liberally

## Questions?

- Architecture questions? Check the [spec docs](./spec/)
- Implementation questions? Check the [plan docs](./plan/)
- Getting started? See the [root README](../README.md)
