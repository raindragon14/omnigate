# Changelog

All notable changes to this project will be documented in this format.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Profile contracts per alias: `omnigate/auto`, `omnigate/code-fast`, `omnigate/code-quality`, `omnigate/general-low-cost` with `categories` + `min_quality_ratio` (provisional 75/85/85/95% of best single-model baseline)
- Request-time profile guard: heuristic task classification (`knowledge`/`coding`/`writing`/`chat`) with scope enforcement (`profile_scope_mismatch`, 400, `omnigate/auto` hint)
- Request-time quality semantics: strict reject for `code-quality` (`no_provider_meets_quality`, 400), best-effort + `quality_bar_missed` log for the other profiles
- Startup validation that every alias has a matching `profiles:` entry
- Prometheus `GET /metrics` endpoint (authenticated) with per-provider gauges for today's stats
- Admin API: `GET /v1/stats`, `POST /v1/admin/cooldowns/clear`, `POST /v1/admin/stats/reset`
- Opt-in chat request/response body logging via `OMNIGATE_LOG_BODIES`
- Shared SQLite stats store (`src/storage/stats-store.ts`) used by chat, metrics, and admin features
- Per-provider cost tariffs (`cost: {input_per_1m, output_per_1m}` in USD, registry) with per-attempt cost accumulation in SQLite (`input_token_count`, `output_token_count`, `total_cost_usd`)
- Per-request `x-request-id` response header plus one structured JSON log line per chat-completion request
- Offline evaluation harness in `eval/` (`bun run eval --router <oracle|random|fixed|omnigate>`, seeded random baseline, Q&A judge, per-split summaries, `--save` artifacts)
- Alias profile schema in the registry (`profiles:` → `categories`, `min_quality_ratio`) validated at startup
- Offline profile quality gate (`bun run eval:check`) comparing saved router results against `min_quality_ratio`
- End-to-end smoke script (`bun run smoke:e2e`, 9 live checks: health, auth, fallback, SQLite, metrics, stats, log correlation, admin ops)
- Mermaid architecture diagram in README
- ARCHITECTURE.md with system design deep-dive
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
- GitHub issue templates (bug report, feature request)
- GitHub PR template

### Changed

- **BREAKING**: alias rename `auto-fast`→`auto`, `auto-quality`+`coding-auto`→`code-quality`, `coding-fast`→`code-fast`, plus new `general-low-cost`; old names return 400 `no_provider_available`
- README restructured with Table of Contents
- README: added real provider example (Groq Llama 3)
- README: replaced ASCII flow with Mermaid diagram
- Body-logging flag is now part of `resetChatCompletionRoutingState` (routing-state reset covers it)
- Metrics and admin tests reset routing state after each test (no cross-test cooldown leakage)

### Fixed

- `normalizeAnswer` strips leading articles after whitespace collapse (eval judge normalization)

## [1.0.0] - 2024-01-15

### Added

- Initial release
- OpenAI-compatible `/v1/chat/completions` endpoint
- Provider routing with weighted signals (latency, throughput, quality, reliability, quota)
- Routing modes: balanced, speed, quality, survival
- Automatic fallback on 429, 5xx, timeout, network error
- SQLite-backed statistics persistence
- Provider registry via YAML (families, aliases, feature flags)
- Constant-time API key authentication
- Streaming passthrough (SSE)
- Health check endpoint (`/health`)
- Models listing endpoint (`/v1/models`)
- Docker deployment with systemd service
- Comprehensive test suite (unit + integration)

### Technical

- Bun runtime with native SQLite
- Hono web framework
- Zod validation
- TypeScript strict mode

## [0.9.0] - 2024-01-10

### Added

- Provider selector with family/feature filtering
- Provider scorer with configurable weights
- Fallback runner with exponential cooldown
- Request normalizer with Zod schemas
- OpenAI-compatible provider adapter
- Basic health and models endpoints

## [0.1.0] - 2024-01-01

### Added

- Project scaffolding
- Bun + TypeScript + Hono setup
- SQLite schema and repository
- Config loading from env + YAML
