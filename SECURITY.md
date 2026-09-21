# Security Policy

## Supported Versions

| Version        | Supported |
| -------------- | --------- |
| main branch    | ✅        |
| Latest release | ✅        |

## Reporting a Vulnerability

**Do not open a public issue.** Email security findings to the maintainer directly.

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge within 48 hours and provide a timeline for resolution.

## Security Considerations

- **API keys**: Provider keys live in environment variables only. Never logged, never returned to clients.
- **Authentication**: All `/v1/*` routes require Bearer token. Comparison uses `timingSafeEqual`.
- **Input validation**: All request bodies validated via Zod schemas.
- **Rate limiting**: Provider-level quota tracking prevents abuse.
- **Streaming**: SSE passthrough — no buffering, no storage of prompts/completions.
- **Dependencies**: Minimal surface (Hono, Zod, YAML). Scanned in CI.

## Threat Model

| Threat                           | Mitigation                                       |
| -------------------------------- | ------------------------------------------------ |
| Timing attack on API key         | Constant-time comparison                         |
| Provider key leakage             | Keys server-side only; never in client responses |
| Injection via malformed requests | Zod validation on all inputs                     |
| DoS via streaming                | No buffering; backpressure handled by upstream   |
| Stats tampering                  | SQLite file local only; no external access       |
