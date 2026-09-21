# Contributing to OmniGate

Thanks for your interest in contributing. This project values **simplicity**, **correctness**, and **production-readiness** over feature velocity.

## How to Contribute

### Reporting Bugs

1. Check existing issues first
2. Open a bug report with:
   - Minimal reproduction steps
   - Expected vs actual behavior
   - Environment (Bun version, OS, provider config)
   - Relevant logs (sanitize API keys)

### Suggesting Features

Open a feature request with:

- Problem statement (what pain point?)
- Proposed solution
- Alternatives considered
- Willingness to implement

### Pull Requests

1. Fork and create a feature branch: `git checkout -b feat/short-description`
2. Make changes with tests
3. Run `bun run typecheck && bun test && bun x prettier --write .`
4. Commit with a conventional message: `feat: add provider health endpoint`
5. Push and open a PR against `main`

## Code Standards

- **TypeScript strict mode** — no `any`, no unchecked indexed access
- **Tests required** — unit tests for logic, integration tests for routes
- **Prettier formatting** — enforced in CI
- **Small, focused PRs** — one logical change per PR

## Project Structure

```
src/
├── server.ts              # Entry point
├── app.ts                 # Hono app factory
├── config/                # Config loading (env + YAML)
├── feature/               # Route handlers (health, models, chat)
├── provider/              # Provider adapters
├── router/                # Scoring, selection, fallback
├── storage/               # SQLite stats repository
└── shared/                # Types, auth, errors
tests/
├── integration/           # Full app integration tests
└── *.test.ts              # Unit tests alongside source
```

## Adding a Provider

1. Edit `src/config/provider.registry.yaml` with provider details
2. Add corresponding `api_key_env` to `.env.example`
3. Add unit tests for any new adapter logic
4. Update `CHANGELOG.md` under "Added"

## Questions?

Open a discussion or issue. We're happy to clarify before you write code.
