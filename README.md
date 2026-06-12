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

## Quick Start

**Docker (any machine):**

```bash
curl -fsSL https://raw.githubusercontent.com/raindragon14/omnigate/main/deploy.sh | bash
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

OpenCode Zen, OpenRouter, Kilo Gateway, Hugging Face, Nous Portal, DeepSeek.

[Full provider table →](docs/PRD.md#6-provider-awal)

## Security

API keys live in your `.env`, loaded into `process.env`, and sent directly to your chosen provider. OmniGate never stores, logs, or transmits them anywhere else. No telemetry, no phone-home, no cloud backend — the project has zero infrastructure you don't control.

[Security model details →](docs/SDS.md#17-privacy-design)

## Architecture

```
HTTP Client → Hono → Feature Layer → Router Core → Policies → Provider Adapter → Provider API
```

[Architecture docs →](docs/SDS.md#5-feature-driven-layering) | [Routing pipeline →](docs/SDS.md#6-core-runtime-flow)

## Project Status

MVP in progress — health and model endpoints live, chat routing under active development.

[See sprint breakdown →](docs/SPRINT_BREAKDOWN.md)

## Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Start with watch mode |
| `bun test` | Run all tests |
| `bun run typecheck` | TypeScript check |

## License

MIT
