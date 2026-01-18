## Decision Frameworks for Agents

### Layout Structure Decisions

**Bordered sidebar vs flowing content:**
```
Is the sidebar navigation-heavy?
├── Yes → Bordered/elevated treatment, clear separation
└── No → Is it contextual/inspector-style?
    ├── Yes → Flow with content, subtle or no border
    └── No → Default to bordered for clarity
```

**Panel density:**
```
Is this a tooling/productivity app?
├── Yes → Bordered panels, clear hierarchy, compact density option
└── No → Is it content-focused (reading, media)?
    ├── Yes → Minimal separation, comfortable density
    └── No → Default treatment
```

### Progressive Disclosure Decisions

```
Does this form/panel have more than 5 fields/options?
├── Yes → Group into sections
│   └── Are some fields rarely used?
│       ├── Yes → Collapse secondary groups by default
│       └── No → Show all groups, use visual hierarchy
└── No → Show all fields, single section
```

