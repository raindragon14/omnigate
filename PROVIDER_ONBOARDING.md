# Add a Custom Provider to OmniGate

> Machine-executable guide for an external AI agent. Follow the steps in order. Stop on the first failing verification and report the exact command output.

## 0. Prerequisites

- OmniGate repo checked out, Bun installed.
- `cp .env.example .env` done.
- You know the upstream API: base URL, model name, API key, and whether it is OpenAI-compatible (`POST {base}/chat/completions` with a Bearer token and OpenAI request/response shape).

## 1. Decide the path

- **OpenAI-compatible upstream** (Groq, Together, OpenRouter, self-hosted vLLM, etc.): YAML-only. Skip to step 2.
- **Non-OpenAI upstream** (Anthropic native, Gemini native, custom RPC): you must write an adapter first. See step 6, then return to step 2.

## 2. Add the `api_key_env`

1. Pick a name: `<VENDOR>_API_KEY` (uppercase, e.g. `GROQ_API_KEY`).
2. Append it to `.env` with the real key and to `.env.example` with an empty value.
3. Verify: `grep <VENDOR>_API_KEY .env .env.example` shows both files.

## 3. Add the provider entry

Edit `src/config/provider.registry.yaml` under `providers:`. Copy this template and fill every required field:

```yaml
  - id: groq_llama3
    base_url: "https://api.groq.com/openai/v1"
    model: "llama-3.3-70b-versatile"
    api_key_env: "GROQ_API_KEY"
    family: "chat-fast"
    priority: 90
    quality_score: 85
    speed_score: 95
    enabled: true
    supports_tools: true
    supports_json: true
    supports_streaming: true
    supports_reasoning: true
    # max_tokens_field: max_completion_tokens  # only when the upstream rejects max_tokens
    # cost:                                      # omit entirely when unknown (recorded as unknown, never zero)
    #   input_per_1m: 0.15
    #   output_per_1m: 0.60
    #   source: "vendor pricing page, retrieved YYYY-MM-DD"
    # rate_limit:                                # omit when unknown
    #   rpm: 30
```

Rules:

- `id` is unique and lowercase with underscores. It becomes the stats key. Never reuse an existing id.
- `family` must be an existing routing group (`chat-fast`, `chat-quality`, `chat-balanced`) unless you are deliberately creating a new family (then you must also wire it into `aliases:` in step 4).
- `supports_*` must be honest. Set `false` when unsure: a wrong `true` routes unsupported requests to this provider; a wrong `false` only excludes it from requests needing that feature.
- `max_tokens_field` stays unset unless the upstream errors on `max_tokens` (Anthropic-style APIs need `max_completion_tokens`).
- Cost `source` must name where the tariff came from plus the retrieval date.
- Do NOT invent provider-specific fields. The Zod schema in `src/config/provider-loader.ts` (`providerSchema`) rejects unknown shapes at startup.

## 4. Wire the provider into routing

1. Add the provider's `family` to at least one entry under `aliases:` in the same YAML file.
2. Confirm every alias key under `aliases:` has a matching key under `profiles:` with `categories` and `min_quality_ratio`. Startup throws `Invalid provider registry: profiles.<alias> missing` otherwise.
3. Scope check: requests whose classified category (`knowledge` | `coding` | `writing` | `chat`, see `src/router/task-classifier.ts`) is outside the alias `categories` are rejected with `profile_scope_mismatch` (400). When in doubt, route through `omnigate/auto` (serves all categories).

## 5. Verify (required, in this order)

```bash
bun run typecheck
bun test src/config/provider-loader.test.ts
bun run src/server.ts
```

Then in a second terminal (replace `$KEY` with `OMNIGATE_API_KEY`):

```bash
curl -s http://localhost:8787/v1/models \
  -H "Authorization: Bearer $KEY"
# Expect the alias from step 4 in the id list.

curl -s http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<alias-from-step-4>","messages":[{"role":"user","content":"say hi"}],"max_tokens":16}'
# Expect an OpenAI-shaped JSON response, not no_provider_available.
```

Troubleshooting map:

| Symptom | Cause | Fix |
|---|---|---|
| `Invalid provider registry: ...` at startup | YAML violates `providerSchema`/`aliasSchema`/`profileSchema` | Match the template in step 3 exactly |
| `profiles.<alias> missing` at startup | Alias without a profile entry | Add it under `profiles:` (step 4.2) |
| `400 no_provider_available` on the test call | Key missing, cooldown, family mismatch, or `supports_*` filter | Check `api_key_env` value, `enabled: true`, alias `families`, and feature flags |
| `400 profile_scope_mismatch` | Prompt category outside alias scope | Use `omnigate/auto` or pick an alias covering that category |
| `400 no_provider_meets_quality` | `omnigate/code-quality` bar missed | Expected behaviour for a 95% bar; use `omnigate/code-fast` for best-effort |

## 6. Non-OpenAI upstream: write an adapter

Implement the `ProviderAdapter` contract from `src/shared/signatures.d.ts`:

```typescript
interface ProviderAdapter {
  readonly id: string; // e.g. "anthropic-native"
  supports(request: RouterRequest, provider: ProviderCandidate): boolean;
  transformRequest(request: RouterRequest, provider: ProviderCandidate, apiKey: string): ProviderRequest;
  send(request: ProviderRequest): Promise<ProviderResponse>;
  sendStream(request: ProviderRequest): Promise<ProviderStreamResponse>;
}
```

Constraints (mirror `src/provider/openai-compatible-adapter.ts`):

- `transformRequest` is pure: build `{ url, headers, body }`, no I/O.
- `send`/`sendStream` enforce a 30-second timeout via `AbortController`.
- `sendStream` must return the stream unconsumed. Never buffer or transform stream bytes.
- Normalize errors to `{ status, body, headers, isMalformed }` so `classifyProviderError` can route retries. Only 429 / 5xx / timeout / network error / malformed responses trigger fallback; other 4xx stop routing.
- Add `src/provider/<name>-adapter.ts` plus `<name>-adapter.test.ts` covering transform, timeout, and malformed bodies.

No registry or wiring changes are needed for the adapter itself: the gateway selects it per provider entry.

## 7. Finish

1. `bun x prettier --write <touched-files>` (touched files only; the repo baseline is dirty).
2. `bun run typecheck && bun test`.
3. Update `CHANGELOG.md` under Unreleased → Added with the provider id and family.
4. Restart the gateway. There is no hot reload: registry and `.env` changes require a restart.

## References

- Registry schema: `src/config/provider-loader.ts` (`providerSchema`, `aliasSchema`, `profileSchema`)
- Adapter contract: `src/shared/signatures.d.ts` (`ProviderAdapter`, `ProviderRequest`, `ProviderResponse`)
- Reference adapter: `src/provider/openai-compatible-adapter.ts`
- Scope/quality semantics: `src/router/profile-guard.ts`, `src/router/task-classifier.ts`
- Contributor checklist: `CONTRIBUTING.md` ("Adding a Provider")
- External conventions: [LiteLLM — Adding OpenAI-Compatible Providers](https://docs.litellm.ai/docs/contributing/adding_openai_compatible_providers) (single-file onboarding pattern); [Addy Osmani — AGENTS.md](https://addyosmani.com/agents/15-agents-md/) (imperative, living agent docs)
