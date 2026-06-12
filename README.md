# OmniGate

Self-hosted OpenAI-compatible gateway that unifies every LLM provider behind one endpoint — on your machine, with your keys.

```
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "omnigate/deepseek-v4-flash-auto", "messages": [{"role": "user", "content": "Sorting algorithm in Rust"}]}'
```

[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Bun-ff69b4?style=flat-square&logo=bun)](https://bun.sh)
[![Stars](https://img.shields.io/github/stars/raindragon14/omnigate?style=flat-square)](https://github.com/raindragon14/omnigate)
[![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker)](https://github.com/raindragon14/omnigate/pkgs/container/omnigate)
[![CI](https://img.shields.io/github/actions/workflow/status/raindragon14/omnigate/ci.yml?branch=master&style=flat-square&logo=github)](https://github.com/raindragon14/omnigate/actions)

## Quick Start

**Docker (any machine):**

```bash
curl -fsSL https://raw.githubusercontent.com/raindragon14/omnigate/master/deploy.sh | bash
```

**Or run locally with Bun:**

```bash
git clone https://github.com/raindragon14/omnigate
cd omnigate
cp .env.example .env    # add your API keys
bun install && bun run dev
```

OpenCode config:

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

## Features

| | |
|---|---|
| **Smart routing** | Scores providers on quality, latency, quota, availability, throughput, and feature match. Picks the best one per request. |
| **Automatic fallback** | 429, 5xx, or timeout? Silently retries the next-best provider. |
| **Quota-aware** | Tracks remaining free tier across all providers. Routes to the one with the most runway. |
| **Privacy mode** | Strict mode blocks sensitive prompts from free/trial providers that may use data for training. |
| **Cost guardrails** | Paid fallback is off by default. Hard monthly cap prevents bill shock. |
| **Streaming** | SSE streaming normalized to OpenAI-compatible format. |

## Model Aliases

| Alias | Routes to |
|---|---|
| `omnigate/deepseek-v4-flash-auto` | DeepSeek V4 Flash via best free provider |
| `omnigate/mimo-v2.5-auto` | MiMo V2.5 via best free provider |
| `omnigate/coding-balanced` | Best all-rounder coding model |
| `omnigate/coding-fast` | Fastest coding model |
| `omnigate/emergency-paid` | Paid fallback (off by default) |

## Providers

| Provider | Access | Cost Model | Est. Rate Limits |
|---|---|---|---|
| OpenCode Zen | API key | Free (limited period) | 5-10 RPM |
| OpenCode Zen (MiMo) | API key | Free (limited period) | 5-10 RPM |
| OpenRouter | API key | Free | ~20 RPM |
| Kilo Gateway | API key | Free (verified account) | ~200 RPH |
| Hugging Face | HF Token | Small monthly credit | Conservative |
| Nous Portal | API key | Free (manual verify) | Unknown |
| DeepSeek (paid) | API key | $0.14/$0.28 per 1M tokens | Standard |

## Security

API keys live in your `.env`, loaded into `process.env`, and sent directly to your chosen provider. OmniGate never stores, logs, or transmits them anywhere else.

| Concern | How OmniGate handles it |
|---|---|
| **API keys** | Read from `process.env` only. Never logged, never stored in SQLite, never sent to any OmniGate server (there is none). |
| **Prompt data** | Stays in memory during request processing. Never sent to a third-party server except the intended provider. |
| **Telemetry** | Zero. No analytics, no crash reporting, no phone-home. The project has no backend. |
| **Database** | Local SQLite file contains usage metrics and provider state only — never API keys or prompt content. |

## Architecture

```
Client → HTTP (Hono) → Feature Layer → Router Core → Policies → Provider Adapter → Provider API
```

The router processes requests through five stages: **normalize** (clean input), **filter** (remove invalid providers), **score** (rank by quality/latency/quota), **execute** (send to best candidate), and **fallback** (retry next on failure). Each provider is accessed through an adapter that handles API-specific quirks without leaking into routing logic.

## Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Start with watch mode |
| `bun test` | Run all tests |
| `bun run typecheck` | TypeScript check |

## License

MIT
