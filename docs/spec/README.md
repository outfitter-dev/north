# North Design System Specification (v0.1)

This directory contains the complete specification for North, split into logical sections for easier navigation and maintenance.

## Core Specification

1. [Overview & Philosophy](./01-overview.md)
   - Design philosophy, target stack, theme switching model, scope of truth

2. [The Dials](./02-dials.md)
   - Style dials (typography, spacing, shadows, radius, density, contrast)
   - Policy dials (complexity)
   - Dial-to-token generation and density inheritance

3. [Token Architecture](./03-token-architecture.md)
   - Color bridge between North and both ecosystems
   - Layer 1: shadcn base tokens
   - Layer 2: North surfaces
   - Layer 3: North scales
   - Layer 4: Typography roles
   - Layer 5: Component-level semantic tokens

4. [Component Architecture](./04-component-architecture.md)
   - Component design patterns and structure

5. [Tailwind Class Vocabulary](./05-tailwind-vocabulary.md)
   - Allowed and forbidden Tailwind utilities
   - Class patterns and conventions

6. [Agent Workflow](./06-agent-workflow.md)
   - How AI agents should work with North
   - Decision trees and workflows

7. [Third-Party Component Policy](./07-third-party-policy.md)
   - Rules for integrating external components
   - Wrapper patterns and compatibility

8. [Motion Tokens](./08-motion-tokens.md)
   - Animation and transition tokens
   - Motion design patterns

## Technical Implementation

9. [Enforcement: ast-grep Rules](./09-enforcement.md)
   - Linting and validation rules
   - Enforcement patterns

10. [CLI Architecture](./10-cli-architecture.md)
    - Command-line tool design
    - Commands and usage patterns

11. [Index Architecture](./11-index-architecture.md)
    - File organization and imports
    - Module structure

12. [Refactoring with Confidence](./12-refactoring.md)
    - Migration strategies
    - Safe refactoring patterns

## Project Setup & Configuration

13. [Project Structure](./13-project-structure.md)
    - Directory layout
    - File organization

14. [Configuration](./14-configuration.md)
    - .north/config.yaml structure
    - Configuration options

15. [Drift Detection & Prevention](./15-drift-detection.md)
    - Monitoring design system compliance
    - Automated drift detection

16. [Registry & Distribution](./16-registry-distribution.md)
    - Package registry design
    - Distribution patterns

17. [Adoption Paths](./17-adoption-paths.md)
    - Migration strategies
    - Gradual adoption patterns

## Decision Making & Planning

18. [Decision Frameworks](./18-decision-frameworks.md)
    - Decision-making guidelines
    - Trade-off analysis

19. [Open Questions](./19-open-questions.md)
    - Unresolved design decisions
    - Areas for future exploration

## Reference

20. [Appendices A-C](./20-appendices.md)
    - Appendix A: Full Token Reference
    - Appendix B: Color Science (OKLCH)
    - Appendix C: Glossary

21. [Implementation Notes](./21-implementation-notes.md)
    - Technical implementation details
    - Development notes

22. [Changelog](./22-changelog.md)
    - Version history
    - Changes and updates

---

**Version:** 0.1.0-draft  
**Last Updated:** January 2025

For the complete, unified specification, see [SPEC.md](../../../SPEC.md) in the root directory.
