## Registry & Distribution

North uses a shadcn-compatible registry format for distributing tokens, rules, and composed components.

### Inheritance Model

```
┌─────────────────────────────────────────┐
│  North Base                             │  ← Core principles, foundational rules
│  (the skill itself)                     │    Default token scales
├─────────────────────────────────────────┤
│  Org Registry                           │  ← Published via shadcn-style registry
│  extends: "@north/base"                 │    Brand tokens, locked rules
│  - Locked rules (can't override)        │    Org-wide components
│  - Configurable rules (with defaults)   │
├─────────────────────────────────────────┤
│  Project                                │  ← Local overrides, extensions
│  extends: "@myorg/north-base"           │    Project-specific components
│  - Rule overrides (where allowed)       │
│  - Extended tokens                      │
└─────────────────────────────────────────┘
```

### Pull-Based Updates

- Projects explicitly pull updates from their upstream registry
- `npx north pull` — fetches latest from extends target
- Review changes before accepting
- Once pulled, you own the code

### Registry Item Types

```json
{
  "$schema": "https://north.dev/schema/registry-item.json",
  "name": "elevated-card",
  "type": "registry:component",
  "dependencies": ["@north/tokens"],
  "files": [
    {
      "path": "components/composed/elevated-card.tsx",
      "content": "..."
    }
  ],
  "cssVars": {
    "theme": {
      "shadow-card-elevated": "var(--shadow-pronounced)"
    }
  }
}
```

