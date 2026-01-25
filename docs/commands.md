# Commands

North ships with a small core and a few power tools. These are the ones you'll use most.

## Core

- `north init` - scaffold `.north/` config, rules, and base tokens
- `north gen` - generate tokens from `.north/config.yaml`
- `north check` - lint for design system violations
- `north index` - build the local index used by discovery tools
- `north doctor` - validate setup and drift
- `north context` - print LLM context (use `--compact` for prompts)

## Discovery

- `north find --colors|--spacing|--typography|--tokens` - usage reports
- `north find --patterns` - repeated class patterns
- `north find --cascade <selector>` - cascade debugger
- `north find --similar <file>` - find similar components
- `north adopt` - suggest patterns worth tokenizing
- `north classify` - classify components (primitive | composed | layout)

## Evolution

- `north promote <pattern> --as <name>` - turn a class pattern into a token
- `north refactor --token <name> --to <value>` - refactor a token value
- `north propose` - generate a migration plan from lint violations
- `north migrate` - apply a migration plan in batch
