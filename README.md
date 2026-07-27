# EchoRead

> [!WARNING]  
> This is just experimental at this point; it is still under development. Please do not use it with sensitive data for now; please wait for a
stable release.  
> It's mostly ideal for experimental and learning projects.**

EchoRead transforms any written content — articles, books, PDFs, newsletters, or webpages — into a clear, natural spoken experience.  
Upload a link, and within seconds, the app reads it aloud in a human voice.  
It’s built for everyone who wants to absorb knowledge hands-free — from visually impaired users to professionals on the move.

Articles, pasted text, PDFs (whole, or a page/chapter range) and YouTube videos
can all be turned into narrated audio, in full or as a short or in-depth
summary.

## Running it

```bash
npm install
cp .env.example .env   # then fill in GEMINI_API_KEY
npm run dev            # http://localhost:3000
```

`.env` is git-ignored. The server also reads the same variables straight from
the environment, so CI and hosting platforms can inject them without a file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Article clean-up, summarisation, PDF reading, text-to-speech |
| `BROWSERLESS_API_KEY` | no | Remote-browser fallback for pages that need JavaScript to render |
| `PORT` | no | Defaults to `3000` |

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # client bundle + server bundle into dist/
npm start           # run the built server (needs NODE_ENV=production)
```

## Architecture

The code is organised as two hexagons (ports & adapters) — a browser
application and a server application — sharing a small domain vocabulary and
the HTTP contract between them. Dependencies point inward: nothing in
`domain/` or `application/` imports React, Express, `fetch`, `window` or the
Gemini SDK.

```
src/shared    domain vocabulary + wire contract
src/server    domain → application (ports, use cases) → adapters (http, gemini, scrapers)
src/client    domain → application (ports, use cases) → adapters (react, http, web audio)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full layout and the
reasoning behind where things live.

## Contribute

Feel free to fork, change, and use it however you want. We always appreciate it if you build something interesting and feel like sharing pull requests.

How to contribute:
- Please see [CONTRIBUTING.md](https://github.com/xoriors/rencfs/blob/main/.github/CONTRIBUTING.md)

## Get in touch

- Part of [xorio](https://xorio.rs/)
- [hello@xorio.rs](mailto:hello@xorio.rs)
- [LinkedIn](https://www.linkedin.com/company/xorio)
