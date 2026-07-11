# Agent Orchestration

## Available Agents

### Built-in / Recommended Global Agents (`~/.claude/agents/`)

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code review | After writing code |
| security-reviewer | Security analysis | Before commits |
| build-error-resolver | Fix build errors | When build fails |
| e2e-runner | E2E testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation | Updating docs |

### Meta-Agents (this package)

| Agent | Purpose | Cadence |
|-------|---------|---------|
| reviewer | Standardization, consistency, recurrence prevention | Daily |
| scout | External best-practice observation | Daily diff / Weekly full |
| lab | Internal skill cross-pollination | Daily |
| janitor | Repository cruft detection | Daily light / Weekly full |

See `meta-agents/` for definitions.

## Immediate Agent Usage

No user prompt needed:
1. Complex feature requests → **planner** agent
2. Code just written/modified → **code-reviewer** agent
3. Bug fix or new feature → **tdd-guide** agent
4. Architectural decision → **architect** agent

## Parallel Task Execution

ALWAYS use parallel Task execution for independent operations:

```markdown
# GOOD: Parallel execution
Launch 3 agents in parallel:
1. Agent 1: Security analysis of auth.ts
2. Agent 2: Performance review of cache system
3. Agent 3: Type checking of utils.ts

# BAD: Sequential when unnecessary
First agent 1, then agent 2, then agent 3
```

## Multi-Perspective Analysis

For complex problems, use split role sub-agents:
- Factual reviewer
- Senior engineer
- Security expert
- Consistency reviewer
- Redundancy checker

## Domain Agent Delegation

For organization-specific business agents (e.g., engineering, design, finance):
- Use `agent-call` skill to delegate one-shot queries
- Use `delegate-suggest` skill to surface delegation opportunities to the user
- Never recurse: a delegated agent cannot itself delegate further
