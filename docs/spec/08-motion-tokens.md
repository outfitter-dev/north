
## Motion Tokens (Fast-Follow)

> **Note:** Motion is not in v0.1 scope but is planned as a fast-follow addition.

Motion tokens will cover:
- **Duration scale:** instant | fast | default | slow | deliberate
- **Easing functions:** ease-out, ease-in-out, spring, bounce
- **Reduced motion:** Automatic handling via `prefers-reduced-motion`

Placeholder structure:

```css
/* Duration scale */
--duration-instant: 0ms;
--duration-fast: 100ms;
--duration-default: 200ms;
--duration-slow: 300ms;
--duration-deliberate: 500ms;

/* Easing */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

/* Motion-safe wrapper */
@media (prefers-reduced-motion: no-preference) {
  :root {
    --motion-enabled: 1;
  }
}
```

This will be fully specified in a future revision.
