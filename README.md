# OmniGate

**Self-hosted LLM gateway — unify every provider behind one endpoint, on your machine, with your keys.**

```
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "omnigate/deepseek-v4-flash-auto",
    "messages": [{"role": "user", "content": "Write a fast sorting algorithm in Rust"}]
  }'
```

## Why OmniGate?

Every LLM provider has a different API, rate limit, pricing model, and availability. Juggling them manually is brittle. OmniGate sits **on your machine** and intelligently routes each request to the best available provider.

**Zero cloud dependency. Zero data leakage. Zero account needed with us.**

You bring your own API keys. OmniGate never sees them — they live in your `.env` file and go directly to the provider APIs. No telemetry, no signup, no third party between you and your models.

- **Self-hosted** — runs as a local process. No SaaS, no cloud, no vendor lock-in.
- **Your keys, your risk** — API keys stay in your environment. OmniGate never stores, logs, or transmits them anywhere except to the provider you chose.
- **Smart routing** — picks the best provider per request based on quality, latency, remaining quota, and reliability.
- **Automatic fallback** — when a provider is rate-limited or down, retries the next best candidate.
- **Free-tier maximizer** — tracks quota across all free/trial providers and routes to the one with the most runway.
- **Privacy mode** — strict mode blocks sensitive prompts from reaching free/trial providers that may use data for training.
- **Cost guardrails** — paid fallback is off by default. When enabled, a hard monthly cap prevents bill shock.

> OmniGate is a router, not a proxy, not a bypass, not a service. Every request respects each provider's rate limits and terms of service.

## How It Works

```
┌──────────┐     POST /v1/chat/completions     ┌─────────────────┐
│ OpenCode │ ─────────────────────────────────> │    OmniGate     │
│ or any   │     {"model": "omnigate/..."}      │  (localhost)    │
│ OpenAI   │                                    │                 │
│ Client   │     ┌──────────────────────┐       │                 │
│          │     │  1. Normalize request │       │  Self-hosted   │
│          │     │  2. Filter providers   │       │  Your .env     │
│          │     │  3. Score & rank       │       │  Your keys     │
│          │     │  4. Execute + fallback │       │  Your machine  │
│          │     │  5. Log metrics        │       │                 │
│          │     └──────────────────────┘       │                 │
│          │                                    │                 │
│          │  ◄───────────────────────────────── │                 │
│          │     OpenAI-compatible response      └────────┬────────┘
└──────────┘                                              │
                     ┌─────────────────────────────────────┼──────────────────┐
                     ▼                                     ▼                  ▼
              ┌────────────┐                      ┌────────────┐    ┌────────────┐
              │ OpenCode   │                      │ OpenRouter │    │   DeepSeek │
              │ Zen (free) │                      │  (free)    │    │ (paid, cap)│
              └────────────┘                      └────────────┘    └────────────┘
```

API keys flow from your `.env` → your local process → provider API. They never touch a third-party server, never get logged, never get stored in the database.

## Quick Start

```bash
git clone https://github.com/raindragon14/omnigate
cd omnigate
bun install
cp .env.example .env   # Paste your API keys — they never leave this file
bun run dev
```

Add to your OpenCode config:

```json
{
  "model": "omnigate/deepseek-v4-flash-auto",
  "provider": {
    "omnigate": {
      "name": "OmniGate",
      "options": { "baseURL": "http://localhost:8787/v1" }
    }
  }
}
```

That's it. No account, no registration, no cloud dependency.

## Model Aliases

| Alias | Routes to |
|-------|-----------|
| `omnigate/deepseek-v4-flash-auto` | DeepSeek V4 Flash via best available free provider |
| `omnigate/mimo-v2.5-auto` | MiMo V2.5 via best available free provider |
| `omnigate/coding-balanced` | Best all-rounder coding model |
| `omnigate/coding-fast` | Fastest coding model |
| `omnigate/emergency-paid` | Paid fallback (off by default; configure a budget) |

## Routing

OmniGate scores providers on every request:

- **Quality** (30%), **Availability** (20%), **Throughput** (15%), **Latency** (15%), **Quota remaining** (10%), **Feature match** (10%)

Override the scoring bias with `mode`:

| Mode | When to use |
|------|-------------|
| `balanced` | Everyday default |
| `quality` | Complex reasoning |
| `speed` | Real-time chat / autocomplete |
| `survival` | Stretch limited free quota |

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `GET` | `/v1/models` | List model aliases |
| `POST` | `/v1/chat/completions` | Chat (streaming & non-streaming) |
| `GET` | `/admin/providers` | Provider state & cooldowns |
| `GET` | `/admin/metrics` | Usage & latency |

## Supported Providers

| Provider | Access | Cost Model | Priority |
|----------|--------|------------|---------:|
| OpenCode Zen | API key | Free (limited period) | 100 |
| OpenCode Zen (MiMo) | API key | Free (limited period) | 98 |
| OpenRouter | API key | Free (RPM capped) | 90 |
| Kilo Gateway | API key | Free (verified account) | 85 |
| Hugging Face | HF Token | Small monthly credit | 70 |
| Nous Portal | API key | Free (manual verify required) | 60 |
| DeepSeek (paid) | API key | $0.14/$0.28 per 1M tokens | 40 |

## Architecture

```
src/
├── server.ts             # Entrypoint — runs on your machine
├── app.ts                # Hono app composition
├── feature/              # Feature-driven modules
├── router/               # Core routing engine
├── provider/             # Provider adapters
├── policy/               # Rate-limit, budget, quota, privacy
├── storage/              # SQLite (local only — no secrets stored)
├── job/                  # Health probes
├── config/               # Config loader & YAML provider registry
└── shared/               # Common utilities
```

## Security Model

| Concern | How OmniGate handles it |
|---------|------------------------|
| API keys | Read from `process.env` only. Never logged, never stored in SQLite, never sent anywhere except to the intended provider. |
| Prompt data | Stays in memory during request processing. Never sent to any OmniGate server (there is none). |
| Telemetry | Zero. No analytics, no crash reporting, no phone-home. |
| Database | Local SQLite file. Contains usage metrics and provider state — never API keys or prompt content. |
| Updates | You control when and whether to update. No forced upgrades. |

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start server with watch mode |
| `bun test` | Run all tests |
| `bun run typecheck` | TypeScript check |

## License

MIT

---

*OmniGate is free, open-source, and self-hosted. You control your keys, your data, and your infrastructure.*
