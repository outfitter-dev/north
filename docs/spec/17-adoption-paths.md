## Adoption Paths

### Fresh Project

1. Initialize: `npx north init`
2. Configure dials in `north.config.yaml`
3. Start building — agent follows North workflow automatically

### Existing Project

1. Install: `npx north init --audit`
2. Review audit report:
   - Raw palette usage locations
   - Repeated class patterns
   - Magic number instances
3. Decide per-finding:
   - Fix → update to use tokens
   - Enshrine → add as intentional deviation or extend token system
4. Enable enforcement incrementally:
   - Start with warnings only
   - Promote to errors as codebase cleans up

