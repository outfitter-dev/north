
## Agent Workflow

When an agent works within a North-enabled project, it follows this loop:

### 1. Search Existing Patterns
Before building anything new, check:
- Does a component for this already exist?
- Is there an established pattern in the codebase?
- Use ast-grep to find similar implementations

### 2. Build with Tokens
- Never use raw Tailwind palette colors (blue-500, gray-100)
- Never use arbitrary values for spacing/sizing
- Reference semantic tokens and scales only
- Numeric spacing allowed in layouts, but flag repeated patterns

### 3. Lint Before Committing
Run `north check` before presenting work:
- Catches raw palette usage
- Flags repeated class patterns
- Warns on complexity thresholds
- Suggests token promotions for repeated patterns

**This is mandatory.** Agents must run the linter before presenting any UI work. CI will also run it, but catching issues early saves cycles.

### 4. Fix or Document

If violations exist, the agent must either fix them or add a machine-readable deviation comment:

```tsx
{/* @north-deviation
   rule: no-arbitrary-values
   reason: Legacy API returns fixed 347px width constraint
   ticket: NORTH-123
   count: 1
*/}
<div className="w-[347px]">
```

**Deviation comment format (machine-readable):**
- `rule:` — Which rule is being bypassed
- `reason:` — Why (human explanation)
- `ticket:` — Optional tracking reference
- `count:` — How many instances this comment covers (for aggregation)

This format allows tooling to:
- Count deviations per rule
- Track which reasons are most common
- Automatically flag "3+ same rule/reason" for system review

### 5. Flag System Gaps

If the same deviation appears 3+ times across the codebase, the agent should:

```tsx
{/* @north-candidate
   pattern: w-[347px] for legacy panel widths
   occurrences: 4
   suggestion: Add --width-legacy-panel to token system
*/}
```

The `@north-candidate` comment signals that a pattern has graduated from "exception" to "system gap."

### Enforcement Posture

North enforcement runs at two levels:

**Local (agent/developer):**
- `north check` before presenting work
- Editor integration via ast-grep LSP (real-time feedback)
- Pre-commit hook (optional but recommended)

**CI (required):**
- `north check --strict` in CI pipeline
- Fails build on errors
- Reports warnings without failing
- Generates deviation report for review

Both levels must pass. An agent cannot present work with lint errors, and CI provides the backstop.
