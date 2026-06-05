# PR Draft: Claude Code plugin-first distribution

## Summary

This PR proposes switching Agent-Aiko's Claude Code distribution design from direct `.claude/` ownership to a plugin-first layout.

The goal is to make the distributed installer safe for end users without requiring manual edits to existing project files.

## Problem

The current installer and plugin template both effectively own `.claude/` directly.

That creates unsafe collisions with user-managed files, especially:

- `.claude/CLAUDE.md`
- `.claude/settings.json`

Even if installation succeeds, the current approach cannot guarantee safe upgrades for arbitrary user projects.

## Design direction

The new distribution model is:

1. Treat Agent-Aiko as a plugin-first Claude Code distribution
2. Move plugin-owned assets under:

```text
.claude/plugins/agent-aiko/
```

3. Stop treating these files as installer-owned:

- `.claude/CLAUDE.md`
- `.claude/settings.json`

4. Keep backward compatibility during migration by reading:

```text
.claude/plugins/agent-aiko/...
.claude/...                  # legacy fallback
```

## Scope for implementation

Implementation is expected to proceed in this order:

1. Make runtime path resolution root-aware
2. Add a plugin-specific template layout
3. Point `plugin.json` at the new template
4. Turn `scripts/install.sh` into a plugin-first installer wrapper
5. Add migration from legacy `.claude` layout to plugin root
6. Update README and add migration notes
7. Mark the legacy layout as deprecated

## Migration requirements

The following mutable data must be preserved during migration:

- `aiko/mode`
- `aiko/user.md`
- `aiko/override-history.jsonl`
- `aiko/active-persona`
- `aiko/persona/aiko-override.md`
- `aiko/persona/overrides`
- `aiko/persona/proposals`
- `aiko/capability/rules/rules-base.md`

`origin` and `INVARIANTS` should be refreshed from the new template source of truth.

## Review focus

Please review the following before implementation starts:

1. Whether Claude Code plugin install can fully support this ownership model
2. Whether plugin-local `CLAUDE.md` and `settings.json` are recognized as intended
3. Whether local plugin install and update commands are stable enough for the new installer flow
4. Whether uninstall should keep or remove user mutable data

## Full design spec

The source design spec is tracked in Agent-Lab:

- `architecture/20260605-agent-aiko-claude-plugin-distribution-spec.md`
