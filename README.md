Deckgen

A tiny CLI that generates reveal.js presentations using an LLM.

Quick start

- Install nothing special — the project is a single ES module: run either:

```
npm start
```

or

```
node index.js
```

How it works

- `index.js` generates an outline from a brief, expands slides, resolves images and writes output to the `output/` folder.
- Generated reveal.js presentations live under `output/<slug>_<YYYYMMDD_HHMMSS>/reveal.js/`.

Configuration

- Provider: set `DECKGEN_PROVIDER` to `gemini` or `copilot`.
- Gemini: set `GEMINI_API_KEY` in your environment if using Gemini.
- Copilot: set `COPILOT_GITHUB_TOKEN` (or `GH_TOKEN` / `GITHUB_TOKEN`) if using Copilot.

Notes

- This repository contains no build step or tests; the CLI is run directly.
- See [CLAUDE.md](CLAUDE.md#L1) for additional implementation notes and behaviour.

Examples

- Generate a deck non-interactively (pass args through `npm`):

```
npm start -- --brief "The future of urban cycling" --provider copilot --depth focused --variant light --serve
```

- Or run the CLI directly with Node:

```
node index.js --brief "The future of urban cycling" --provider gemini --serve
```

- To run without starting a server (interactive or script) and serve later:

```
# after a run, change into the reveal.js folder for the generated deck and serve
cd output/<slug>_<YYYYMMDD_HHMMSS>/reveal.js && python3 -m http.server 8000
```

Serve generated decks

- Quick: run the generated deck from `output/` with an npm script that serves the `output` folder on port 8000:

```
npm run serve:output
```

- Then open `http://localhost:8000/` in your browser and navigate to the generated deck folder.

- Quick: serve the most-recently generated deck and open it in your browser:

```
npm run serve:latest
```

Help

- Show the built-in help and available options:

```
node index.js --help
```

For implementation notes, see [CLAUDE.md](CLAUDE.md#L1).
