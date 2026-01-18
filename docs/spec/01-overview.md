# North: Design System Skill Specification

> A self-enforcing design system for building durable, themeable frontends with AI agents.

**Version:** 0.1.0-draft  
**Last Updated:** January 2025

---

## Overview

North is a design system skill that teaches AI agents how to build and maintain consistent, themeable frontend interfaces. It combines principles (the *why*), token architecture (the *what*), enforcement tooling (the *how*), and a registry-based distribution model.

The core insight: agents optimize for *working code now* rather than *maintainable architecture over time*. North provides the constraints and feedback loops to produce durable, forward-looking frontend code.

### Design Philosophy

**Roles, not values.** Inspired by Apple's Human Interface Guidelines, North uses semantic roles rather than literal values. You never say "gray at 60% opacity" — you say "muted" and the system figures out what that means in light mode, dark mode, at different contrast levels.

**Defaults with intentional escape hatches.** Rules exist to be followed most of the time. Breaking a rule requires explicit intention and documentation. If a rule is broken repeatedly, that's signal the system needs to evolve.

**Configure the system, not individual components.** A handful of dials control the entire visual language. Components reference roles, roles reference dials.

### Target Stack (v0.1)

North v0.1 targets:
- **React** (Next.js, Vite, etc.)
- **Tailwind CSS v4** (with `@theme` directive)
- **shadcn/ui** (as the primitive component layer)
- **OKLCH color model** (matching shadcn's current approach)

**Browser compatibility:** Tailwind v4 requires modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+). North inherits this floor. If you need legacy browser support, Tailwind v3 + a North v3-compat layer would be a separate effort.

The principles are portable; platform-specific implementations (SwiftUI, etc.) are future extensions.

### Theme Switching Model

North supports two complementary switching mechanisms:

**Runtime switching (light/dark/contrast):**
- Uses CSS class or `data-` attribute (e.g., `.dark`, `[data-theme="dark"]`)
- Switches are boolean states that users toggle
- CSS variables cascade automatically
- No rebuild required

**Build-time generation (dial changes):**
- Dials like `radius`, `density`, `shadows` are design decisions
- Changing a dial regenerates `north/tokens/generated.css`
- Run `north gen` after config changes
- Requires rebuild/deploy

The distinction: **dark/light is a user preference toggle. Dial changes are design system evolution.**

Configuration example:
```yaml
# north.config.yaml
switching:
  runtime:
    - light-dark     # .dark class or [data-theme="dark"]
    - contrast       # [data-contrast="high"] for accessibility
  build-time:
    - radius
    - density
    - shadows
    - typography
```

This means a single CSS bundle supports light/dark/contrast combinations, but dial changes require regeneration.

### Scope of Truth (v0.1)

North enforcement covers:
- ✅ TSX/JSX component files (class strings, inline styles)
- ✅ CSS files defining tokens (`globals.css`, `north/tokens/*`)
- ✅ Tailwind config extensions

North does **not** enforce (v0.1):
- ❌ Third-party component internals (see Third-Party Policy)
- ❌ MDX/content files (future consideration)
- ❌ SVG internals (future consideration)
- ❌ External stylesheets from dependencies

This boundary is explicit so teams know what North guarantees.
