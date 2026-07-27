# Architecture

EchoRead is organised as **two hexagons** (ports & adapters) that meet at a
shared contract: a browser application that decides *how a document is read
aloud*, and a server application that decides *how a source becomes text*.

```
                    ┌──────────── src/shared ────────────┐
                    │  domain vocabulary + wire contract │
                    └────────────────────────────────────┘
                             ▲                  ▲
   ┌─────────────────────────┴──────┐   ┌───────┴───────────────────────────┐
   │        src/client              │   │          src/server               │
   │                                │   │                                   │
   │  React ──▶ use cases ──▶ ports │   │  HTTP ──▶ use cases ──▶ ports     │
   │  (driving)            (driven) │   │  (driving)          (driven)      │
   │                          │     │   │                        │          │
   │            HTTP / WebAudio /   │   │        Gemini / Jina / raw fetch / │
   │            clipboard / storage │   │        Browserless / console       │
   └────────────────────────────────┘   └───────────────────────────────────┘
```

The rule that shapes every directory: **dependencies point inward.** Domain
knows nothing. Application knows domain and its own ports. Adapters know
application. Nothing in `domain/` or `application/` imports React, Express,
`fetch`, `window` or the Gemini SDK.

## Layout

```
src/
├── shared/                     Vocabulary both sides speak
│   ├── domain/                 ReadMode, SourceKind, PdfSelection,
│   │                           GroundingSource, voices, error types
│   └── contracts/api.ts        Route paths and request/response payloads
│
├── server/
│   ├── domain/                 ContentDocument, RawArticle, prompts,
│   │                           video-analysis parsing
│   ├── application/
│   │   ├── ports/              ArticleFetcher, ContentAnalyzer,
│   │   │                       SpeechSynthesizer, Logger
│   │   └── usecases/           ReadArticle, AnalyzeVideo, SummarizeText,
│   │                           ReadPdf, SpeakText
│   ├── adapters/
│   │   ├── inbound/http/       Express routers, request parsing,
│   │   │                       error translation, static site
│   │   └── outbound/           article/  jina, http, browserless, fallback
│   │                           gemini/   analyzer, synthesizer, error mapper
│   │                           logging/  console logger
│   ├── config/                 environment + composition root
│   └── main.ts                 process entry point
│
└── client/
    ├── domain/                 Narration, chunking, highlighting, playback,
    │                           library rules, form validation
    ├── application/
    │   ├── ports/              ContentGateway, SpeechGateway, AudioOutput,
    │   │                       Ticker, StatusChannel, PdfSource,
    │   │                       LibraryRepository
    │   ├── narrationPlayer.ts  the reading engine
    │   └── usecases/           LoadContent, LibraryService
    ├── adapters/
    │   ├── inbound/react/      App, components, hooks, DI context
    │   └── outbound/           http/    api client + gateways
    │                           audio/   Web Audio output, PCM, ticker
    │                           pdf/     local file + remote download
    │                           status/  in-process pub/sub
    │                           storage/ library repository
    │                           browser/ clipboard, downloads
    ├── config/container.ts     composition root
    └── main.tsx                browser entry point
```

## Where things live

**Prompts are domain, not infrastructure.** `server/domain/prompts.ts` defines
what "short summary" or "clean article" means for this product. The Gemini
adapter knows how to send a `Prompt`; it does not know what is in one.

**Fetching an article is a chain of responsibility.**
`FallbackArticleFetcher` walks a reader proxy, a plain GET and a remote browser
in order of cost, and each delegate declares how much text it must return
before its answer counts. Adding or reordering a strategy is a change to one
array in `server/config/container.ts`.

**Errors are types, not strings.** Adapters translate provider failures into
`ValidationError`, `ContentUnavailableError`, `RateLimitedError`,
`ConfigurationError` and `UpstreamError` at the boundary. One Express
middleware turns those into status codes, and the browser's API client reads
the code back to decide whether retrying could possibly help.

**The reading engine is framework-free.** `NarrationPlayer` owns chunk
synthesis, caching, prefetch, seam-crossing and the transport state machine. It
reaches the network, the speaker and the frame clock only through ports, and
publishes an immutable snapshot that React binds to with
`useSyncExternalStore`. Swapping the view layer would not touch it.

**Composition happens in exactly two files.** `server/config/container.ts` and
`client/config/container.ts` are the only modules that name concrete adapters.
Everything else depends on interfaces, which is what makes the ports worth
having: a test builds a container from fakes and exercises the real use cases.

## Adding things

- **A new content source** — add a case to `LoadContentCommand`, a method on
  `ContentGateway`, a use case on the server, a route, and a form component.
  The player is untouched.
- **A different speech provider** — implement `SpeechSynthesizer`, wire it in
  the server container. Nothing else changes.
- **Persistent history** — implement `LibraryRepository` against
  `localStorage` or an API and swap it in the client container. The cap and
  de-duplication rules stay in `client/domain/library.ts`.
