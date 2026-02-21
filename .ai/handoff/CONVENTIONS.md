# failprompt — Agent Conventions

> Every agent working on this project must read and follow these conventions.

---

## Language

- All code, comments, commits, and documentation in **English only**

## Code Style

- **TypeScript** strict mode (`strict: true`, `noUncheckedIndexedAccess`)
- **ESM** — `"type": "module"` in package.json; `.js` extensions in imports
- **No semicolons**, single quotes, trailing commas (Prettier defaults)
- Validate untrusted input (CLI args, shell output) before processing

## CLI-Specific Rules

- **stdout** = final output only (pipe-friendly — no spinners, no colors on stdout)
- **stderr** = progress info, hints, errors (e.g. clipboard tip)
- Never call `process.exit()` in library code — only in `index.ts`
- Errors must have human-readable messages + actionable hints

## Branching & Commits

```
feat/<short-name>    → new feature
fix/<short-name>     → bug fix
docs/<short-name>    → documentation only
chore/<short-name>   → tooling, deps, config

Commit format:
  feat: add GitLab CI support [AAHP-auto]
  fix: handle empty log output gracefully [AAHP-fix]
```

## Testing

- Unit tests for all core logic (`error-extractor`, `prompt-builder`)
- Use fixture strings — do NOT shell out in tests
- `npm test` must pass before every commit
- `npm run build` (tsc) must pass before every commit

## What Agents Must NOT Do

- Push directly to `main`
- Add runtime dependencies without documenting the reason in LOG.md
- Write API tokens, secrets, or credentials into any file
- Shell out to external services in tests
