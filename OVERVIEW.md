# North: A Design System Skill for AI Agents

**Version:** 0.1.0 Overview
**Status:** Draft

---

## The Problem

AI coding agents are remarkably capable at producing working code. But when it comes to frontend design, there's a consistency problem.

**Agents optimize for *working code now* rather than *maintainable architecture over time*.**

In practice, this means:
- Every new component invents its own spacing, colors, and radii
- `bg-blue-500` shows up next to `bg-primary` in the same codebase
- Magic numbers proliferate: `p-[13px]`, `w-[347px]`, `gap-[22px]`
- What looks fine in isolation creates visual chaos at scale

The rest of development has tooling to enforce consistency—linters, type systems, formatters. Design systems exist precisely to solve this problem for human teams. But agents don't have access to these guardrails in a way they can actually use.

**This isn't about rigidity. It's about enabling agents to do frontend design reliably.**

A human designer with a design system produces consistent, themeable, maintainable UI. An agent with North can do the same.

---

## What North Is

North is a **design system skill**—a set of principles, tokens, and enforcement tooling that teaches AI agents how to build consistent, themeable frontend interfaces.

```
┌─────────────────────────────────────────────────────────────┐
│  Without North                                              │
│                                                             │
│  Agent → Working code → Inconsistent UI → Tech debt         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  With North                                                 │
│                                                             │
│  Agent → Constrained code → Consistent UI → Maintainable    │
│            ↑                                                │
│            └── Lint feedback, token vocabulary, rules       │
└─────────────────────────────────────────────────────────────┘
```

The core insight: **constraints enable creativity, not limit it.** By giving agents a vocabulary of design tokens and rules to follow, they produce code that humans actually want to maintain.

---

## The Mental Model

North is built on three interlocking concepts:

### 1. Dials (the design decisions)

A small number of high-level controls that shape the entire visual language:

| Dial | What it controls |
|------|------------------|
| Typography | Type scale, line heights, letter spacing |
| Spacing | Base unit, scale progression |
| Shadows | Depth perception (none → pronounced) |
| Radius | Corner treatment (sharp → rounded) |
| Density | Padding, margins, touch targets |
| Contrast | Color differentiation, accessibility |

Change a dial, regenerate tokens, everything updates proportionally.

### 2. Tokens (the vocabulary)

Semantic design values that components reference:

```css
/* Instead of magic numbers... */
padding: 13px;
background: #3b82f6;
border-radius: 5px;

/* ...semantic tokens */
padding: var(--control-padding);
background: var(--primary);
border-radius: var(--radius-md);
```

Tokens are organized in layers, from foundational scales to component-specific values:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Base (shadcn compatibility)                       │
│  --primary, --background, --border, --radius                │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Scales                                            │
│  --spacing-xs/sm/md/lg/xl, --shadow-subtle/default/elevated │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Semantic roles                                    │
│  --text-heading, --text-body, --surface-raised              │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Component tokens                                  │
│  --control-height, --card-padding, --card-radius            │
└─────────────────────────────────────────────────────────────┘
```

### 3. Enforcement (the guardrails)

Rules that catch violations and guide agents toward correct patterns:

```
❌  bg-blue-500        →  "Use semantic token: bg-primary"
❌  p-[13px]           →  "Use scale: p-md or token: p-(--control-padding)"
⚠️  gap-6 (5th time)   →  "Consider extracting to --gap-cards"
```

Enforcement runs locally (before the agent presents work) and in CI (as a backstop).

---

## How It Works in Practice

### Agent Workflow

When an agent builds UI in a North-enabled project:

1. **Search existing patterns** — Does a component for this already exist?
2. **Build with tokens** — Use semantic values, never raw palette colors or arbitrary numbers
3. **Lint before presenting** — Run `north check` to catch violations
4. **Fix or document** — Either correct issues or add explicit deviation comments

```
┌─────────────────────────────────────────────────────────────┐
│  Agent builds component                                     │
│          ↓                                                  │
│  Runs `north check`                                         │
│          ↓                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Violations found?                                    │   │
│  │   ├─ Yes → Fix violations → Re-check                │   │
│  │   └─ No  → Present work to human                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### The Allowed Vocabulary

| ✅ Allowed | ❌ Prohibited |
|-----------|--------------|
| `bg-primary`, `text-muted-foreground` | `bg-blue-500`, `text-gray-600` |
| `p-md`, `gap-lg`, `rounded-card` | `p-[13px]`, `gap-[22px]` |
| `shadow-subtle`, `shadow-elevated` | `shadow-[0_4px_6px_rgba...]` |
| `p-(--control-padding)` (token reference) | `p-[calc(16px*1.5)]` (literal math) |

The rule is simple: **semantic tokens in components, never raw values.**

---

## Key Capabilities

### Discovery Tools

North isn't just a linter—it's a design system power tool:

```bash
north find --colors      # What colors are actually in use?
north find --patterns    # What class clusters repeat?
north find --similar X   # What looks like this component?
north find --cascade .btn # Why does this element look wrong?
```

The cascade debugger traces styling through the component tree:

```
Cascade trace for: .btn-primary
═══════════════════════════════════════════════════════════════

Background: oklch(0.205 0 0) ← OPAQUE (expected transparency?)

Resolution chain:
  1. bg-primary/80           → applies 0.8 alpha
  2. --primary resolves to   → oklch(0.205 0 0) ← no alpha in source
  3. Wrapped by Card         → has bg-background (opaque)

⚠️  Conflict: Button wants transparency, Card has opaque background.
```

### Pattern Promotion

When the same pattern appears repeatedly, North suggests graduating it to a token:

```bash
north find --patterns

# Output:
# "rounded-lg bg-card p-6 shadow-subtle" appears 7 times
# "gap-6" appears 12 times in layout files

north promote "p-6" --as p-card
# 1. Adds --spacing-card to theme
# 2. Generates codemod to update usages
# 3. Updates lint rules to prefer p-card
```

The system learns from usage. Repeated patterns become first-class tokens.

### Safe Refactoring

Before changing a token, simulate the impact:

```bash
north refactor "--card-padding" --to "1rem" --dry-run

# Direct usages: 23 locations across 12 files
# Cascade dependencies: 8 more via aliases
# Rule evaluation: 1 warning, 1 violation
# 
# Options:
#   --apply    Execute changes
#   --force    Bypass rule violations (not recommended)
```

---

## Target Stack (v0.1)

North v0.1 targets the modern React ecosystem:

- **React** (Next.js, Vite, etc.)
- **Tailwind CSS v4** (with `@theme` directive)
- **shadcn/ui** (as the primitive component layer)
- **OKLCH color model** (perceptually uniform, matches shadcn)

The principles are portable—SwiftUI, Flutter, and other platforms are future extensions.

---

## What This Enables

### For Individual Projects

- Agents produce consistent UI from day one
- Components are themeable (light/dark, density, contrast)
- Technical debt from "just make it work" decisions is prevented
- Human designers can adjust dials without touching components

### For Organizations

- Design system rules can be locked at the org level
- Projects inherit sensible defaults, override where needed
- New team members (human or agent) produce consistent output immediately

### For the Ecosystem

- Registry-based distribution (like shadcn, but for design system rules)
- Pull-based updates—you own the code once you pull it
- Composable: North base → Org layer → Project layer

```
┌─────────────────────────────────────────┐
│  North Base                             │  ← Core principles, foundational rules
│  (the skill itself)                     │
├─────────────────────────────────────────┤
│  Org Registry                           │  ← Brand tokens, locked rules
│  extends: "@north/base"                 │
├─────────────────────────────────────────┤
│  Project                                │  ← Local overrides, extensions
│  extends: "@myorg/north-base"           │
└─────────────────────────────────────────┘
```

---

## The Philosophy

**Roles, not values.** You never say "gray at 60% opacity"—you say "muted" and the system handles light mode, dark mode, high contrast.

**Defaults with escape hatches.** Rules exist to be followed. Breaking a rule requires explicit documentation. If the same rule breaks repeatedly, that's signal the system needs to evolve.

**Configure the system, not components.** A handful of dials control the entire visual language. Components just reference tokens.

**Progressive adoption.** Start by banning raw palette colors (easy win). Add semantic spacing as patterns emerge. Tighten rules as token coverage grows.

---

## Summary

North exists because agents are great at writing code but bad at design consistency. The solution isn't to make them "better at design"—it's to give them the same constraints that make human design systems work.

**The agent writes the code. North ensures it's the right code.**

```
┌─────────────────────────────────────────────────────────────┐
│  Problem: Agents optimize for working code, not durable     │
│           architecture. Frontend design suffers.            │
├─────────────────────────────────────────────────────────────┤
│  Solution: A skill that teaches agents design system        │
│            principles through tokens and enforcement.       │
├─────────────────────────────────────────────────────────────┤
│  Result: Consistent, themeable, maintainable UI—whether     │
│          built by humans or agents.                         │
└─────────────────────────────────────────────────────────────┘
```