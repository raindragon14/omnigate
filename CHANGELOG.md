# Changelog

All notable changes to this project will be documented in this format.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mermaid architecture diagram in README
- ARCHITECTURE.md with system design deep-dive
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
- GitHub issue templates (bug report, feature request)
- GitHub PR template

### Changed

- README restructured with Table of Contents
- README: added real provider example (Groq Llama 3)
- README: replaced ASCII flow with Mermaid diagram

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
