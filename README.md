# OmniGate 🚪

**One endpoint to reach every LLM.** OmniGate is an OpenAI-compatible router that unifies multiple model providers — free, trial, subscription, and paid — behind a single local API. It intelligently selects the best provider for every request based on quality, latency, quota, reliability, privacy, and cost.

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "omnigate/deepseek-v4-flash-auto",
    "messages": [{"role": "user", "content": "Write a fast sorting algorithm in Rust"}]
  }'
```

## Why OmniGate?

LLM providers are fragmented. Each has its own API, rate limits, pricing model, and quirks. Switching between them — or hedging against one going down — means reconfiguring your client every time.

**OmniGate solves this** by acting as a transparent middleware between you and every provider:

- **One URL, one API key convention** — Point any OpenAI-compatible client at OmniGate.
- **Smart fallback** — When one provider is rate-limited (429), down (5xx), or slow, OmniGate silently retries the next best option.
- **Quota-aware routing** — It tracks your remaining free tier across all providers and picks the one with the most runway.
- **Privacy-first** — Strict mode blocks sensitive prompts from free/trial providers that may use data for model training.
- **Cost-controlled** — Paid fallback is disabled by default. When enabled, a hard monthly cap prevents bill shock.

## How It Works

```
┌──────────┐     POST /v1/chat/completions     ┌──────────┐
│ OpenCode │ ─────────────────────────────────> │ OmniGate │
│ or any   │     {"model": "omnigate/..."}      │          │
│ OpenAI   │                                    │          │
│ Client   │     ┌──────────────────────┐       │          │
│          │     │  1. Normalize request │       │          │
│          │     │  2. Filter providers   │       │          │
│          │     │  3. Score & rank       │       │          │
│          │     │  4. Execute + fallback │       │          │
│          │     │  5. Log metrics        │       │          │
│          │     └──────────────────────┘       │          │
│          │                                    │          │
│          │  ◄───────────────────────────────── │          │
│          │     OpenAI-compatible response      │          │
└──────────┘                                    └────┬─────┘
                                                      │
                     ┌────────────────────────────────┼────────────────────┐
                     ▼                                ▼                    ▼
              ┌────────────┐                  ┌────────────┐      ┌────────────┐
              │ OpenCode   │                  │ OpenRouter │      │   DeepSeek │
              │ Zen (free) │                  │  (free)    │      │ (paid, cap)│
              └────────────┘                  └────────────┘      └────────────┘
```

## Quick Start

```bash
git clone https://github.com/<your-org>/omnigate
cd omnigate
bun install
cp .env.example .env   # Add your API keys
bun run dev
```

OpenCode config:

```json
{
  "model": "omnigate/deepseek-v4-flash-auto",
  "provider": {
    "omnigate": {
      "name": "OmniGate",
      "options": { "baseURL": "http://localhost:8787/v1" },
      "models": {
        "deepseek-v4-flash-auto": {},
        "mimo-v2.5-auto": {},
        "coding-balanced": {},
        "coding-fast": {}
      }
    }
  }
}
```

## Model Aliases

| Alias | What it routes to |
|-------|-------------------|
| `omnigate/deepseek-v4-flash-auto` | DeepSeek V4 Flash via best available free provider |
| `omnigate/mimo-v2.5-auto` | MiMo V2.5 via best available free provider |
| `omnigate/coding-balanced` | Best all-rounder coding model |
| `omnigate/coding-fast` | Fastest coding model |
| `omnigate/emergency-paid` | Paid fallback (off by default; configure a budget) |

## Routing Behavior

OmniGate scores providers on every request using six weighted dimensions:

- **Quality** (30%) — historical correctness rate
- **Availability** (20%) — uptime and error rate
- **Throughput** (15%) — tokens per second
- **Latency** (15%) — time to first token
- **Quota remaining** (10%) — how much free/paid capacity is left
- **Feature match** (10%) — tool calling, JSON mode, streaming, context window

Requests can specify a `mode` to bias the score:

| Mode | Best for |
|------|----------|
| `balanced` | Everyday use (default) |
| `quality` | Complex reasoning tasks |
| `speed` | Real-time chat / autocomplete |
| `survival` | Stretching limited free quota |

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `GET` | `/v1/models` | List model aliases |
| `POST` | `/v1/chat/completions` | Chat (streaming & non-streaming) |
| `GET` | `/admin/providers` | Provider state & cooldowns |
| `GET` | `/admin/metrics` | Usage & latency metrics |

## Supported Providers

| Provider | Access | Cost Model | Default Priority |
|----------|--------|------------|-----------------:|
| OpenCode Zen | API key | Free (limited period) | 100 |
| OpenCode Zen (MiMo) | API key | Free (limited period) | 98 |
| OpenRouter | API key | Free (RPM capped) | 90 |
| Kilo Gateway | API key | Free (verified account) | 85 |
| Hugging Face | HF Token | Small monthly credit | 70 |
| Nous Portal | API key | Free (requires manual verify) | 60 |
| DeepSeek (paid) | API key | $0.14/$0.28 per 1M tokens | 40 |

## Architecture

```
src/
├── server.ts
├── app.ts
├── feature/          # Feature-driven modules
│   ├── health/       # GET /health
│   ├── model/        # GET /v1/models
│   ├── chat-completion/  # POST /v1/chat/completions
│   └── admin/        # Admin dashboard
├── router/           # Core routing engine
├── provider/         # Provider adapters (one per provider)
├── policy/           # Rate-limit, budget, quota, cooldown, privacy
├── storage/          # SQLite persistence
├── job/              # Health probes & benchmarks
├── config/           # Config loader & provider YAML
└── shared/           # Common utilities & types
```

## Scripts

| Command | What it does |
|---------|-------------|
| `bun run dev` | Start with watch mode |
| `bun test` | Run all tests |
| `bun run typecheck` | TypeScript check |

## Project Status

OmniGate is in active development (MVP phase). Currently implemented:
- [x] HTTP server with Hono (health + models endpoints)
- [x] OpenAI-compatible error shapes
- [x] Config loader with port validation
- [x] Provider registry schema (YAML)
- [x] Test infrastructure (unit + integration)
- [ ] Chat completion routing (in progress)
- [ ] Provider adapters & fallback
- [ ] Rate limiting & cooldown
- [ ] SQLite persistence
- [ ] Privacy mode
- [ ] Streaming
- [ ] Health probes & EWMA scoring

## License

MIT

---

*OmniGate is not a proxy, a bypass, or an abuse tool. Every request respects provider rate limits and terms of service.*
