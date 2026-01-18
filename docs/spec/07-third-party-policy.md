
## Third-Party Component Policy

Third-party components (npm packages, external UI libraries) often ship with their own styles that may violate North principles. This policy defines how to handle them.

### Exception List

Maintain an explicit list of allowed third-party components in `north.config.yaml`:

```yaml
third-party:
  allowed:
    - package: "@radix-ui/*"
      reason: "Headless primitives, styled by shadcn layer"
    
    - package: "react-day-picker"
      reason: "Calendar primitive, styled via shadcn Calendar"
    
    - package: "recharts"
      reason: "Charts use --chart-* tokens, some internal classes unavoidable"
      
    - package: "cmdk"
      reason: "Command palette primitive"
```

When the linter encounters classes from an allowed package, it skips enforcement for that scope.

### Extend Pattern (Wrapping)

For components that need customization, use the "extend" pattern — wrap the third-party component and apply North tokens:

```tsx
// components/composed/themed-datepicker.tsx
import { DatePicker as BaseDatePicker } from "third-party-lib";
import { cn } from "@/lib/utils";

export function DatePicker({ className, ...props }) {
  return (
    <BaseDatePicker
      className={cn(
        // Override third-party defaults with North tokens
        "rounded-control border-border bg-surface-base",
        "focus:ring-ring/20 focus:ring-2",
        className
      )}
      {...props}
    />
  );
}
```

The wrapper becomes the blessed component; direct usage of the base component is discouraged.

### Prohibited Packages

Some packages are fundamentally incompatible with North (e.g., they inline arbitrary colors everywhere). These can be explicitly prohibited:

```yaml
third-party:
  prohibited:
    - package: "some-opinionated-ui-lib"
      reason: "Inlines colors, cannot be themed"
      alternative: "Use shadcn/ui equivalent"
```

The linter will error if a prohibited package is imported.
