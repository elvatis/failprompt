# failprompt: Autonomous Multi-Agent Workflow

> Based on the [AAHP Protocol](https://github.com/elvatis/AAHP).
> This file documents how agents collaborate on this project autonomously.

---

## Agent Roles

| Agent      | Model                       | Role        | Responsibility                                 |
| ---------- | --------------------------- | ----------- | ---------------------------------------------- |
| 🔭 Sonar   | perplexity/sonar-pro        | Researcher  | npm ecosystem, GitHub API docs, OSS gaps       |
| 🏛️ Opus   | anthropic/claude-opus-4-6   | Architect   | ADRs, module design, CLI interface decisions   |
| ⚙️ Sonnet  | anthropic/claude-sonnet-4-6 | Implementer | Code, tests, commits, pushes                   |
| 💬 ChatGPT | openai-codex/gpt-5.3-codex  | Reviewer    | Edge cases, error handling, UX of CLI output   |

---

## Pipeline Phases

### 1: Research (Sonar)
Reads `NEXT_ACTIONS.md`. Searches for: existing tools in the space, relevant npm packages, API documentation. Writes findings to `LOG.md`.

### 2: Architecture (Opus)
Reads Sonar findings. Decides: module structure, algorithm design, CLI interface, dependencies. Writes ADR to `LOG.md` with numbered instructions for Sonnet.

### 3: Implementation (Sonnet)
Reads ADR. Creates feature branch. Writes code + tests. Runs `npm run build` and `npm test`. Commits and pushes. Updates `STATUS.md` and `DASHBOARD.md`.

### 4: Discussion Round (Opus + ChatGPT)
Both review the branch. Opus checks architectural adherence. ChatGPT checks edge cases and UX. Findings in `LOG.md`.

### 5: Fix (Sonnet)
Applies review findings. Re-runs tests. Pushes. Updates `DASHBOARD.md` and `TRUST.md`.

---

## Autonomy Boundaries

| Allowed ✅                              | Not allowed ❌                              |
| --------------------------------------- | ------------------------------------------- |
| Write code, tests, docs                 | Push to `main`                              |
| Create and push feature branches        | Add runtime deps without LOG.md entry       |
| Run `npm install`, `npm test`, `tsc`    | Write credentials or secrets into files     |
| Make architecture decisions             | Publish to npm without human approval       |

---

## Notification Rule

**Notify project owner only when a full task is done**, not on phase transitions.
Format: `✅ failprompt [feature] done - Branch: feat/... - Tests: X/X`

---

*This project is an AAHP case study, the workflow IS the product documentation.*
