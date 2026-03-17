# failprompt: Agent Conventions

> Every agent working on this project must read and follow these conventions.

---

## Language

- All code, comments, commits, and documentation in **English only**

## Code Style

- **TypeScript** strict mode (`strict: true`, `noUncheckedIndexedAccess`)
- **ESM**: `"type": "module"` in package.json; `.js` extensions in imports
- **No semicolons**, single quotes, trailing commas (Prettier defaults)
- Validate untrusted input (CLI args, shell output) before processing

## CLI-Specific Rules

- **stdout** = final output only (pipe-friendly: no spinners, no colors on stdout)
- **stderr** = progress info, hints, errors (e.g. clipboard tip)
- Never call `process.exit()` in library code, only in `index.ts`
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
- Use fixture strings, do NOT shell out in tests
- `npm test` must pass before every commit
- `npm run build` (tsc) must pass before every commit

## What Agents Must NOT Do

- Push directly to `main`
- Add runtime dependencies without documenting the reason in LOG.md
- Write API tokens, secrets, or credentials into any file
- Shell out to external services in tests

---

## 🚨 Release-Regel: Erst fertig, dann publishen (gilt für ALLE Plattformen)

**IMMER erst alles fertigstellen, danach publishen. Kein einziger Commit mehr dazwischen.**
Gilt für GitHub, npm, ClawHub, PyPI — egal ob ein Projekt auf einer oder mehreren Plattformen ist.
Sonst divergieren die Tarballs/Releases zwangsläufig.

### Reihenfolge (nie abweichen)
1. Alle Änderungen + Versionsbumps in **einem einzigen Commit** abschließen
2. `git push` → Plattform 1 (z.B. GitHub)
3. `npm publish` / `clawhub publish` / etc. — alle weiteren Plattformen
4. Kein weiterer Commit bis zum nächsten Release (außer reine interne Doku)

### Vor jedem Release: Alle Versionsstellen prüfen
```bash
grep -rn "X\.Y\.Z\|Current version\|Version:" \
  --include="*.md" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
```
Typische vergessene Stellen: `README.md` Header, `SKILL.md` Footer, `package.json`,
`openclaw.plugin.json`, `.ai/handoff/STATUS.md` (Header + Plattform-Zeilen), Changelog-Eintrag.

### Secrets & private Pfade — NIEMALS in Repos
- Keine API Keys, Tokens, Passwörter, Secrets in Code oder Docs
- Keine absoluten lokalen Pfade (`/home/user/...`) in publizierten Dateien
- Keine `.env`-Dateien committen — immer in `.gitignore`
- Vor jedem Push: `git diff --staged` auf Secrets prüfen
