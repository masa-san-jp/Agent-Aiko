# Claude Code migration notes

## Safe installer behavior

The Claude Code installer now avoids taking ownership of user-managed project files.

It does not overwrite:

- `.claude/CLAUDE.md`
- `.claude/settings.json`

It initializes or updates:

- `~/.aiko/`
- `.claude/skills/aiko*/`
- `.claude/scripts/aiko-*.sh`
- `.claude/session-state/current.md.example`

## From legacy `.claude/aiko/`

Older Agent-Aiko Claude Code installs stored mutable Aiko data under the project-local `.claude/aiko/` directory.

When the installer runs and `~/.aiko/mode` does not exist yet, it copies mutable legacy data from `.claude/aiko/` into `~/.aiko/` before refreshing template-managed files.

Preserved mutable data:

- `mode`
- `user.md`
- `override-history.jsonl`
- `active-persona`
- `persona/aiko-override.md`
- `persona/overrides`
- `persona/proposals`
- `capability/skills`
- `capability/rules/rules-base.md`

Template-managed files such as `persona/origin/persona.md`, `persona/aiko-origin.md`, and `persona/INVARIANTS.md` are refreshed from the current Agent-Aiko template.

## Re-running the installer

Re-running the installer is the supported update path.

```bash
cd <project>
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash
```

For non-interactive environments:

```bash
bash claude-code/scripts/install.sh --yes
```

The installer keeps user mutable data and refreshes command/template assets.
