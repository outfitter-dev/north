## Implementation Notes (Logged for Build Phase)

Items surfaced during spec review that don't require spec changes but should be addressed during implementation:

### From External Reviews

**LLM-Friendly Error Output (Gemini)**
- `north check` errors should include "nearest neighbor" token suggestions
- Example: "Arbitrary value `w-[347px]`. Closest tokens: `--sidebar-width (320px)`, `--container-prose (65ch)`"
- Index should be queryable for token proximity matching
- Consider JSON/structured output mode for agent consumption

**Agent Lockout Prevention (Gemini)**
- If an agent fails lint 3+ times on same issue, consider allowing force-commit with `@north-deviation`
- Prevents infinite correction loops
- May be too prescriptive — evaluate during agent testing

**`north context --compact` (Gemini)**
- Add a minified output mode for system prompt injection
- "We are using North. Primary: `oklch(...)`. Spacing scale: `md=1rem`. No arbitrary values."
- Helps agents with limited context windows

**Index Determinism (ChatGPT)** ✅ *Now in spec*
- Determinism requirements promoted to Index Architecture section
- Consider `index.jsonl` as alternative committable format if SQLite merges prove painful (future)

**Rule Taxonomy (ChatGPT)**
- Finalize canonical rule IDs before publishing registry items
- Consider splitting `no-arbitrary-values` into:
  - `no-arbitrary-literals` (ban brackets without `var(--`)
  - `no-arbitrary-colors` (separate, already exists)
- Token-anchored expressions route through multiplier policy + promote logic

**`@utility` vs `@apply` (ChatGPT)**
- When promoting utilities that need variant support (`hover:`, `focus:`, responsive), use `@utility`
- Document `@reference` requirement for CSS modules/Vue/Svelte `<style>` blocks

**ast-grep File Conventions (ChatGPT)**
- `**/*.{tsx,jsx}` → `language: tsx`
- `**/*.{ts,js}` → `language: typescript` (for non-JSX rules like import checks)

### Future Considerations (v0.2+)

**Visual Regression Integration**
- North ensures *code structure* is correct, not that it *looks* correct
- An agent could use valid tokens but produce broken UI (e.g., `--text-display` in a tiny button)
- Future: integrate with screenshot diffing or computed style verification
- Requires headless browser — significant scope expansion

**Promotion Output Format**
- Standardize on `@utility` blocks for named utilities (done in spec)
- Keep `@apply` as implementation detail inside `@utility` body where needed

