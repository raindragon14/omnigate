# Free Model Router

An OpenAI-compatible router for [OpenCode](https://opencode.ai) that aggregates multiple legal LLM providers into a single local endpoint. It intelligently selects the best provider per request based on quality, latency, throughput, quota, reliability, privacy requirements, and budget constraints.

> **Legal-first, quota-aware, privacy-conscious.** This is not a rotating proxy or a free-tier bypass system. Every request uses your own API keys and respects each provider's rate limits and terms of service.

## Features

- **Single OpenAI-compatible endpoint** — Point OpenCode (or any OpenAI client) at `http://localhost:8787/v1` and use router model aliases.
- **Multi-provider aggregation** — Combine free, free-credit, subscription, and paid fallback providers under one roof.
- **Smart provider selection** — Scores candidates by quality, availability, throughput, latency, remaining quota, and feature match.
- **Graceful fallback** — On 429, 5xx, timeout, or quota exhaustion, automatically falls back to the next-best provider.
- **Rate-limit awareness** — Token-bucket enforcement per provider for RPM, RPH, RPD, and concurrency; automatic cooldown after 429.
- **Privacy mode** — Strict mode prevents sensitive prompts from reaching free/trial providers that may use data for improvement.
- **Paid fallback with hard cap** — Off by default; when enabled, enforces a configurable monthly budget.
- **Health probes & metrics** — Periodic health checks, EWMA-based scoring, SQLite-persisted usage and latency metrics.
- **Streaming pass-through** — SSE streaming normalized to OpenAI-compatible format.

## Supported Providers

| Provider | Models | Cost |
|----------|--------|------|
| [OpenCode Zen](https://opencode.ai) | `opencode/deepseek-v4-flash-free`, `opencode/mimo-v2.5-free` | Free (limited time) |
| [OpenRouter](https://openrouter.ai) | `deepseek/deepseek-v4-flash:free` | Free (rate-limited) |
| [Kilo Gateway](https://kilo.ai) | `kilo/deepseek/deepseek-v4-flash:free` | Free |
| [Hugging Face Inference](https://huggingface.co) | `deepseek-ai/DeepSeek-V4-Flash` | Small monthly credit |
| [Nous Portal](https://portal.nousresearch.com) | `deepseek/deepseek-v4-flash:free` | Free (disabled until verified) |
| [DeepSeek](https://deepseek.com) | `deepseek-v4-flash` | Paid (emergency fallback, off by default) |

## Model Aliases

The router exposes stable aliases instead of raw provider model names:

| Alias | Description |
|-------|-------------|
| `free-router/deepseek-v4-flash-auto` | DeepSeek V4 Flash — auto-selects best free provider |
| `free-router/mimo-v2.5-auto` | MiMo V2.5 — auto-selects best free provider |
| `free-router/coding-balanced` | Best all-around coding model |
| `free-router/coding-fast` | Lowest-latency coding model |
| `free-router/emergency-paid` | Paid fallback (requires explicit enablement) |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.3.14+
- API keys for the providers you want to use

### Installation

```bash
git clone <repo-url>
cd free-model-router
bun install
```

### Configuration

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Add your API keys to `.env`:
   ```env
   PORT=8787
   OPENCODE_API_KEY=
   OPENROUTER_API_KEY=
   KILO_API_KEY=
   HUGGINGFACE_API_KEY=
   NOUS_API_KEY=
   DEEPSEEK_API_KEY=
   ```
3. (Optional) Edit `src/config/provider.registry.yaml` to adjust priorities, rate limits, or disable providers.

### Running

```bash
# Start the server
bun run dev
```

The router is now live at `http://localhost:8787`.

### Verify

```bash
# Health check
curl http://localhost:8787/health

# List available models
curl http://localhost:8787/v1/models

# Send a chat completion
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "free-router/deepseek-v4-flash-auto",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### OpenCode Integration

Add this to your OpenCode config:

```json
{
  "model": "free-router/deepseek-v4-flash-auto",
  "provider": {
    "free-router": {
      "name": "Free Model Router",
      "options": {
        "baseURL": "http://localhost:8787/v1"
      },
      "models": {
        "deepseek-v4-flash-auto": { "name": "DeepSeek V4 Flash Auto" },
        "mimo-v2.5-auto": { "name": "MiMo V2.5 Auto" },
        "coding-balanced": { "name": "Coding Balanced" },
        "coding-fast": { "name": "Coding Fast" }
      }
    }
  }
}
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/v1/models` | List available model aliases |
| `POST` | `/v1/chat/completions` | Chat completion (OpenAI-compatible) |
| `GET` | `/admin/providers` | Provider status overview |
| `GET` | `/admin/metrics` | Latency, error, token, and cost metrics |

### Routing Modes

Add `mode` to your request body to influence provider selection:

| Mode | Behavior |
|------|----------|
| `balanced` (default) | Balances quality, latency, quota, and reliability |
| `quality` | Picks highest-quality provider available |
| `speed` | Prioritizes low TTFT and high tokens/sec |
| `survival` | Maximizes remaining quota, avoids paid fallback |

### Privacy Mode

Set `privacy_mode: "strict"` in your request to block free/trial providers that may use your data for model improvement. If no safe provider is available, the request is rejected with a `privacy_policy_blocked` error.

## Architecture

```
src/
├── server.ts                          # Bun HTTP server entrypoint
├── app.ts                             # Hono app composition
├── feature/
│   ├── health/                        # GET /health
│   ├── model/                         # GET /v1/models
│   ├── chat-completion/               # POST /v1/chat/completions
│   └── admin/                         # Admin endpoints
├── router/
│   ├── request-normalizer.ts          # OpenAI → internal request
│   ├── provider-selector.ts           # Candidate filtering
│   ├── provider-scorer.ts             # Candidate ranking
│   └── fallback-runner.ts             # Retry/failover loop
├── provider/
│   ├── provider-adapter.ts            # Adapter contract
│   ├── openai-compatible-adapter.ts   # Generic adapter
│   ├── opencode-zen.adapter.ts
│   ├── openrouter.adapter.ts
│   ├── kilo.adapter.ts
│   ├── huggingface.adapter.ts
│   ├── nous.adapter.ts
│   └── deepseek.adapter.ts
├── policy/
│   ├── rate-limit.policy.ts           # Token bucket
│   ├── budget.policy.ts               # Paid fallback budget
│   ├── quota.policy.ts                # Usage quota
│   └── cooldown.policy.ts             # Post-429 cooldown
├── storage/
│   ├── sqlite.database.ts
│   ├── provider.repository.ts
│   ├── usage.repository.ts
│   └── metric.repository.ts
├── job/
│   ├── health-check.job.ts
│   └── benchmark.job.ts
├── config/
│   ├── config-loader.ts
│   └── provider.registry.yaml         # Provider definitions
└── shared/
    ├── app-error.ts
    ├── http-status.ts
    ├── ids.ts
    ├── clock.ts
    └── result.ts
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server with file watching |
| `bun test` | Run all tests |
| `bun run test:feature` | Run feature-level tests |
| `bun run test:integration` | Run cross-feature integration tests |
| `bun run typecheck` | Type-check the codebase |

## Provider Selection

1. **Normalize** — Convert the OpenAI-compatible request into an internal `RouterRequest`.
2. **Filter** — Remove disabled, keyless, cooldown, exhausted, budget-over, or feature-incompatible providers.
3. **Score** — Rank remaining candidates on quality, availability, throughput, latency, quota, and feature match.
4. **Execute** — Send through the best adapter. On failure (429, 5xx, timeout), fall back to the next candidate.
5. **Record** — Log usage, latency, tokens, cost, and status to SQLite.

### Scoring Formula

```
score = 0.30 × qualityScore
      + 0.20 × availabilityScore
      + 0.15 × throughputScore
      + 0.15 × latencyScore
      + 0.10 × quotaRemainingScore
      + 0.10 × featureMatchScore
      - penalties
```

Penalties include recent 429s (-40), 5xx (-25), timeouts (-30), and privacy risk (-10 to -30).

## Development

### Project Structure

- **Feature-driven** — Each capability (health, models, chat) lives in its own feature folder with routes, controllers, services, schemas, and tests.
- **Code conventions** — Follow `docs/SDS.md` §13: functions ≤25 lines, files ≤300 lines, no magic numbers/strings, descriptive naming.
- **Signature manifest** — Public types and function declarations are maintained in `docs/codebase-signatures.d.ts`.

### Adding a Provider

1. Add provider config to `src/config/provider.registry.yaml`.
2. Create an adapter in `src/provider/` implementing the `ProviderAdapter` contract.
3. Add the API key variable to `.env.example`.
4. Update tests.

## Configuration

### Environment Variables

See `.env.example` for all required variables. API keys must only be set via environment variables — they are never stored in SQLite, logs, or config files.

### Provider Registry

Edit `src/config/provider.registry.yaml` to manage providers, adjust priorities, rate limits, model mappings, and budget caps.

## License

MIT
