# OmniGate

One local OpenAI-compatible endpoint for OpenCode users who want free-model fallback without manually switching providers.

OmniGate pools OpenCode Zen and OpenRouter free models behind one base URL and one local API key. It keeps provider keys server-side, skips providers without configured keys, and routes each request toward the fastest useful free option based on speed, coding quality, quota pressure, reliability, and first-token behavior.

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OMNIGATE_API_KEY" \
  -d '{"model": "omnigate/deepseek-v4-flash-auto", "messages": [{"role": "user", "content": "Sorting algorithm in Rust"}]}'
```

[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-ff69b4?style=flat-square&logo=bun)](https://bun.sh)
[![Stars](https://img.shields.io/github/stars/raindragon14/omnigate?style=flat-square)](https://github.com/raindragon14/omnigate)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker)](https://github.com/raindragon14/omnigate/pkgs/container/omnigate)
[![CI](https://img.shields.io/github/actions/workflow/status/raindragon14/omnigate/ci.yml?branch=master&style=flat-square&logo=github)](https://github.com/raindragon14/omnigate/actions)

## Quick Start

Use Docker if you want OmniGate as a local gateway for OpenCode. Use local development if you are changing the router itself.

Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/raindragon14/omnigate/master/deploy.sh | bash
```

Local development:

```bash
git clone https://github.com/raindragon14/omnigate
cd omnigate
cp .env.example .env
# Set OMNIGATE_API_KEY before starting. Provider keys are optional, but no
# upstream provider will be selectable until OPENCODE_API_KEY or OPENROUTER_API_KEY is set.
bun install
bun run dev
```

Required environment:

| Variable | Purpose |
| --- | --- |
| `OMNIGATE_API_KEY` | Local bearer token required at startup and for `/v1/*` routes. |
| `OPENCODE_API_KEY` | Enables OpenCode Zen providers. |
| `OPENROUTER_API_KEY` | Enables OpenRouter free providers. |
| `OMNIGATE_DB_PATH` | Optional SQLite stats path; defaults to `.data/omnigate.sqlite`. |

OpenCode config:

```json
{
  "model": "omnigate/deepseek-v4-flash-auto",
  "provider": {
    "omnigate": {
      "name": "OmniGate",
      "options": {
        "baseURL": "http://localhost:8787/v1",
        "apiKey": "YOUR_OMNIGATE_API_KEY"
      }
    }
  }
}
```

## Product Focus

OmniGate is for a single developer or trusted local deployment that wants a stable OpenAI-compatible base URL for coding workflows. It is not a general provider marketplace or hosted multi-user gateway.

In scope:

- OpenCode Zen and OpenRouter free models.
- One OpenAI-compatible base URL.
- One OmniGate API key for clients.
- Server-side provider API keys from environment variables.
- Automatic fallback across eligible free providers.
- Simple SQLite stats for speed, quota, latency, failures, and cooldowns.

Out of scope:

- Paid fallback.
- Admin dashboard.
- Multi-user auth or billing.
- Provider marketplace.
- Automated quality benchmarking.

## Current Capabilities

Implemented now:

| Capability | Status |
| --- | --- |
| Health check | `GET /health` |
| Model aliases | `GET /v1/models` |
| Chat completions | `POST /v1/chat/completions` |
| OmniGate API key auth | Required for `/v1/*` |
| Provider registry | YAML config in `src/config/provider.registry.yaml` |
| Provider filtering | Alias family, enabled flag, API key, paid fallback flag, cooldown, and feature support |
| Provider ranking | Stats-aware speed, quality, quota, latency, and reliability scoring |
| Fallback | Handles `429`, `5xx`, timeout, network error, and malformed response |
| Adapter | Generic OpenAI-compatible adapter |
| SQLite provider stats | Stores routing signals in `OMNIGATE_DB_PATH` |
| Persisted cooldowns | Restored before provider selection |
| Streaming | OpenAI-compatible SSE pass-through for `stream: true` |
| First-token timing | Persists average time-to-first-token for streamed responses |

Next planned:

- Hardening from real provider usage and deferred extensions as needed.

## Model Aliases

Target aliases:

| Alias | Intent |
| --- | --- |
| `omnigate/deepseek-v4-flash-auto` | Best current free DeepSeek-compatible provider. |
| `omnigate/mimo-v2.5-auto` | Best current free MiMo provider when available. |
| `omnigate/coding-balanced` | Best current free coding provider with speed-first scoring and quality guardrails. |
| `omnigate/coding-fast` | Fastest useful free coding provider. |

## Routing Strategy

Provider choice should optimize in this order:

1. Speed.
2. Coding quality.
3. Quota availability.
4. Fast first response or first token.

`70 tokens/second` is a target, not a hard requirement. If every free provider is slower, OmniGate should still choose the best available free option.

## Security

| Concern | Handling |
| --- | --- |
| OmniGate API key | Read from `OMNIGATE_API_KEY`; required at startup and for all `/v1/*` routes. |
| Provider API keys | Read from provider-specific environment variables only. |
| Prompt data | Kept in memory during request handling. Not persisted. |
| Completion data | Returned to the client. Not persisted. |
| SQLite | Stores routing stats only in `.data/omnigate.sqlite` by default, never secrets or content. |
| Streaming | Passes provider SSE bytes through without storing chunks. |
| Paid providers | Out of scope. |

## Architecture

```text
Client -> Hono route -> feature service -> router core -> provider adapter -> provider API
```

Near-term routing memory:

```text
router core <-> SQLite provider_stats
```

Ignored local product/design notes may exist under `docs/`; when they conflict with executable config or source, trust the executable source.

## Scripts

| Command | Purpose |
| --- | --- |
| `bun install` | Install dependencies |
| `bun run dev` | Start with watch mode |
| `bun test` | Run all tests |
| `bun run test:feature` | Run `src/` unit and collocated integration tests |
| `bun run test:integration` | Run cross-feature integration tests in `tests/` |
| `bun run typecheck` | TypeScript check |

## License

MIT
