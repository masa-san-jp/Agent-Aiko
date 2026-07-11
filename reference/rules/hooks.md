# Hooks System

## Hook Types

- **PreToolUse**: Before tool execution (validation, parameter modification)
- **PostToolUse**: After tool execution (auto-format, checks)
- **SessionStart**: When a Claude Code session starts (e.g., trigger meta-check)
- **Stop**: When session ends (final verification)

## Recommended Default Hooks

### PreToolUse
- **tmux reminder**: Suggests tmux for long-running commands (npm, pnpm, yarn, cargo, etc.)
- **git push review**: Opens diff viewer before push for review
- **doc blocker**: Blocks creation of unnecessary .md/.txt files

### PostToolUse
- **PR creation logger**: Logs PR URL after `gh pr create`
- **Prettier**: Auto-formats JS/TS files after edit
- **TypeScript check**: Runs tsc after editing .ts/.tsx files
- **console.log warning**: Warns about console.log in edited files

### SessionStart
- **meta-check**: Detects overdue meta-agents (24h threshold) and creates pending markers
  See `tools/meta-check.sh` in this package.

### Stop
- **console.log audit**: Checks all modified files for console.log before session ends

## Auto-Accept Permissions

Use with caution:
- Enable for trusted, well-defined plans
- Disable for exploratory work
- Never use `dangerously-skip-permissions` flag
- Configure `allowedTools` in `~/.claude.json` instead

## TodoWrite Best Practices

Use TodoWrite tool to:
- Track progress on multi-step tasks
- Verify understanding of instructions
- Enable real-time steering
- Show granular implementation steps

Todo list reveals:
- Out of order steps
- Missing items
- Extra unnecessary items
- Wrong granularity
- Misinterpreted requirements

## Configuration Location

Hooks are configured in `~/.claude/settings.json` (global) or `<repo>/.claude/settings.json` (project).

Example SessionStart hook for meta-check:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash <your-org-repo>/Agent-team/agents/.claude/scripts/meta-check.sh"
          }
        ]
      }
    ]
  }
}
```
