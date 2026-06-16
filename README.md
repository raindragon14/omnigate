# OmniGate

One local OpenAI-compatible endpoint that pools free LLM providers behind a single base URL with automatic fallback and intelligent routing.

[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-ff69b4?style=flat-square&logo=bun)](https://bun.sh)
[![CI](https://img.shields.io/github/actions/workflow/status/raindragon14/omnigate/ci.yml?branch=master&style=flat-square&logo=github)](https://github.com/raindragon14/omnigate/actions)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker)](https://github.com/raindragon14/omnigate/pkgs/container/omnigate)

## Why

Switching between OpenCode Zen and OpenRouter free models manually is tedious. OmniGate gives you one stable `baseURL` and one API key — it picks the fastest available free provider for each request, falls back automatically on rate limits or errors, and tracks performance in SQLite so routing improves over time.

## Quick Start

**Docker (recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/raindragon14/omnigate/master/deploy.sh | bash
```

**Local development:**

```bash
git clone https://github.com/raindragon14/omnigate && cd omnigate
cp .env.example .env
# Edit .env — set OMNIGATE_API_KEY and at least one provider key
bun install
bun run dev
```

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `OMNIGATE_API_KEY` | Yes | Bearer token clients use to authenticate. Generated automatically by `deploy.sh`. |
| `OPENCODE_API_KEY` | No | Enables OpenCode Zen providers. |
| `OPENROUTER_API_KEY` | No | Enables OpenRouter free providers. |
| `OMNIGATE_DB_PATH` | No | SQLite stats path. Defaults to `.data/omnigate.sqlite`. |

At least one provider key is needed for chat requests to work.

## Use with OpenCode

Add to your OpenCode config:

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

## Model Aliases

| Alias | Description |
| --- | --- |
| `omnigate/deepseek-v4-flash-auto` | Best available free DeepSeek provider. |
| `omnigate/mimo-v2.5-auto` | Best available free MiMo provider. |
| `omnigate/coding-balanced` | Best free coding provider, speed-first with quality guardrails. |
| `omnigate/coding-fast` | Fastest free coding provider. |

## How Routing Works

Each request is matched to an alias, filtered to eligible providers (correct family, API key present, not in cooldown, supports required features), then scored and ranked by:

1. **Speed** — configured speed score + observed tokens/second.
2. **Quality** — configured quality score.
3. **Quota** — daily request pressure vs. configured limits.
4. **Reliability** — failure and rate-limit penalties from SQLite stats.

The highest-scoring provider is tried first. On `429`, `5xx`, timeout, network error, or malformed response, OmniGate falls back to the next provider automatically.

## API

| Endpoint | Auth | Description |
| --- | --- | --- |
| `GET /health` | No | Liveness check. Returns `{"status":"ok"}`. |
| `GET /v1/models` | Yes | Lists available model aliases. |
| `POST /v1/chat/completions` | Yes | OpenAI-compatible chat completions with automatic provider routing and streaming. |

## Security

- **Localhost only** — Docker binds to `127.0.0.1:8787`. Not exposed to the network.
- **API key auth** — All `/v1/*` routes require a Bearer token. Comparison uses constant-time `timingSafeEqual`.
- **Keys server-side** — Provider API keys live in environment variables, never sent to clients.
- **No data persistence** — Prompts and completions stay in memory. SQLite stores routing stats only.
- **Streaming passthrough** — SSE bytes flow through without buffering or storage.

## Development

```bash
bun install            # Install dependencies
bun run dev            # Start with watch mode
bun test               # Run all tests
bun run typecheck      # TypeScript check
```

## License

[MIT](LICENSE)
