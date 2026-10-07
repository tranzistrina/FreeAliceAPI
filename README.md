# FreeAliceAPI

Unofficial Node.js proxy for Yandex Alice AI with an OpenAI-compatible HTTP API.

## Modes

**Anonymous** is the default. No Yandex password or account credential is stored.

**Optional Yandex ID session** uses browser cookies. The login helper starts a separate Chrome profile, lets you complete Yandex login yourself, and saves only the resulting Yandex cookies to alice-auth.json.

The upstream transport is the current undocumented Alice web/consumer WebSocket protocol. It may change when Yandex changes the site. Because apparently undocumented protocols dislike retirement.

## Install

Requirements: Node.js 20+, npm, and internet access to Alice.

~~~bash
npm install
npm start
~~~

Default URL:

~~~text
http://127.0.0.1:9655
~~~

## API

- GET /health
- GET /readyz
- GET /v1/models
- GET /v1/sessions
- POST /v1/chat/completions
- POST /v1/messages
- POST /v1/responses
- POST /reset-session

## Quick test

~~~bash
curl http://127.0.0.1:9655/health
curl http://127.0.0.1:9655/v1/models
~~~

OpenAI Chat Completions:

~~~bash
curl -X POST http://127.0.0.1:9655/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "alice",
    "messages": [{"role": "user", "content": "Привет. Ответь одной короткой фразой."}]
  }'
~~~

Streaming compatibility:

~~~bash
curl -N -X POST http://127.0.0.1:9655/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "alice",
    "stream": true,
    "messages": [{"role": "user", "content": "Напиши короткую шутку."}]
  }'
~~~

Alice's consumer transport currently yields completed response text rather than a clean token stream, so stream=true is exposed as one completed answer wrapped in SSE.

## Models

| Alias | Backend |
| --- | --- |
| alice | Yandex Alice AI |
| alice-ai | Yandex Alice AI |
| yagpt | Yandex Alice AI / YaGPT-compatible alias |

These are compatibility aliases, not a promise of a stable public Yandex model selector.

## Login

Anonymous mode needs nothing.

For a browser login:

~~~bash
npm run auth
npm start
~~~

The helper uses an isolated Chrome profile and opens https://alice.yandex.ru/. Complete Yandex ID verification manually, then press Enter. The project never asks for your Yandex password.

For a headless server, export Yandex cookies as JSON from a browser you control:

~~~bash
npm run auth:import -- --input cookies.json
~~~

Optional output path:

~~~bash
npm run auth:import -- --input cookies.json --output ./alice-auth.json
~~~

You may also supply a cookie header directly:

~~~bash
ALICE_COOKIE='Session_id=...; yandexuid=...' npm start
~~~

Treat alice-auth.json and ALICE_COOKIE as secrets.

## Sessions

Use X-Alice-Session or X-Session-Id to keep a stable upstream WebSocket.

~~~text
X-Alice-Session: my-chat
~~~

The HTTP request should still include the multi-turn messages you want Alice to see. The proxy folds them into a text prompt and serializes requests per session.

Inspect:

~~~bash
curl http://127.0.0.1:9655/v1/sessions
~~~

Reset one:

~~~bash
curl -X POST 'http://127.0.0.1:9655/reset-session?session=my-chat'
~~~

Reset all:

~~~bash
curl -X POST 'http://127.0.0.1:9655/reset-session?session=all'
~~~

## Compatible endpoints

/v1/messages accepts a basic Anthropic-style message payload and returns one assistant text block.

/v1/responses accepts a basic OpenAI Responses-style input and returns a completed response object.

These are shims for existing clients. Alice does not natively speak those APIs.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| HOST | 127.0.0.1 | HTTP listen address |
| PORT | 9655 | HTTP port |
| PROXY_API_KEY | empty | Optional Bearer token for the local API |
| ALICE_COOKIE | empty | Raw Yandex cookie header |
| ALICE_AUTH_PATH | ./alice-auth.json | Saved cookie file |
| ALICE_TIMEOUT_MS | 60000 | Upstream request timeout |
| ALICE_MAX_PROMPT_CHARS | 6000 | Prompt trim limit |
| ALICE_SESSION_TTL_MS | 1800000 | Idle session cleanup |
| ALICE_APP_VERSION | built-in | Alice web client version |

## OpenAI-compatible clients

Base URL:

~~~text
http://127.0.0.1:9655/v1
~~~

When PROXY_API_KEY is set, send:

~~~text
Authorization: Bearer YOUR_PROXY_API_KEY
~~~

## What is deliberately not faked

- native token-by-token Alice streaming;
- OpenAI tools translated into Alice actions;
- arbitrary image/file upload;
- bypasses for subscriptions, rate limits, CAPTCHAs or anti-bot controls;
- automated password login.

## Troubleshooting

If the handshake times out, check internet access and whether Yandex changed the current Alice WebSocket protocol.

If a stored session is rejected, run npm run auth again or import fresh cookies.

The upstream endpoint used by this implementation is:

~~~text
wss://uniproxy.alice.yandex.net/uni.ws
~~~

## Development

~~~bash
npm run check
npm test
~~~

Tests are local and do not contact Alice.
