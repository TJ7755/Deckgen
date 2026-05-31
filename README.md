Deckgen

Deckgen is a Node.js CLI that writes reveal.js presentation decks from a single brief.

Decks are built around one idea: one brief, five phases, a deck worth showing.

What it does

- Generates presentation decks with an LLM, then writes a self-contained reveal.js output folder.
- Uses web search and workspace file scanning to gather evidence before drafting the deck.
- Resolves images, builds chart data where needed, and writes the finished deck into `output/`.

Five phases, one brief

1. Evidence: web search and workspace file scan surface relevant context before any writing begins.
2. Outline: the LLM proposes a story structure, which you can review and revise in plain English.
3. Design: a fresh design system is generated for each deck, including a font pair, colour palette, and a signature visual move.
4. Content: each slide is expanded into full copy, with captions, statistics, quotes, and chart data where needed.
5. Build: reveal.js is cloned, images are resolved, and the final HTML deck is written to disc.

Six modes for different kinds of deck

- Visual Journalism: story-driven decks with strong visual storytelling.
- Teaching: curriculum-aligned slides with official sources where possible.
- Data-Driven: boardroom-ready analysis.
- Pitch Deck: investor storytelling shaped around problem, solution, market, traction, business model, and ask.
- Keynote / Conference: speaker-led presentations.
- Workshop / Training: decks for facilitation, activities, reflection, and guided learning sequences.

Ten slide types

- Title Card
- Transition
- Image Hero
- Caption Card
- Chart - Bar
- Chart - Line
- Data Table
- Quote Callout
- Stat Callout
- Comparison

Five depth modes

- `overview`: quick overview, about 4 to 5 slides.
- `focused`: focused story, about 8 to 10 slides.
- `standard`: standard, about 16 to 22 slides.
- `thorough`: thorough, about 28 to 40 slides.
- `comprehensive`: comprehensive, about 55 to 75 slides.

Quick start

1. Clone the repository and install dependencies.

```
git clone https://github.com/TJ7755/Deckgen.git
cd deckgen
npm install
```

2. Set your provider credentials.

```
echo "GEMINI_API_KEY=your_key_here" > .env
```

If you are using Copilot, set `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` instead.

If you are using Codex, set `CODEX_API_KEY` or `OPENAI_API_KEY`. You can also pass Codex CLI overrides as JSON in `DECKGEN_CODEX_CONFIG`, for example to configure MCP servers or other native CLI options.

3. Run the CLI.

```
npm start
```

Or run it directly:

```
node index.js
```

4. Pass a brief directly when you want to skip prompts.

```
npm start -- --brief "The future of urban cycling" --provider codex --depth focused --variant dark --serve
```

5. Install globally if you want the `deckgen` command available from any directory.

```
npm install -g .
deckgen
```

Commands

- `npm start`: run the default generate flow.
- `npm run generate`: run generate explicitly.
- `npm run plan`: generate an outline and design plan only.
- `npm run doctor`: check environment and credentials.
- `npm run serve:output`: serve the `output/` folder on port 8000.
- `npm run serve:latest`: serve the most recently generated deck.

Configuration

- `DECKGEN_PROVIDER`: set the default provider to `gemini`, `copilot`, or `codex`.
- `GEMINI_API_KEY`: used for Gemini auth.
- `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`: used for Copilot auth.
- `CODEX_API_KEY` or `OPENAI_API_KEY`: used for Codex auth.
- `DECKGEN_COPILOT_MODEL`: optional Copilot model override.
- `DECKGEN_CODEX_MODEL`: optional Codex model override.
- `DECKGEN_CODEX_CONFIG`: optional JSON object of Codex CLI config overrides, including MCP/custom tool settings and web-search toggles.
- `DECKGEN_CODEX_THREAD_ID`: optional persisted Codex thread id for resuming the same agent session.

Output

- Generated decks live under `output/<slug>_<YYYYMMDD_HHMMSS>/reveal.js/`.
- The generated folder includes `index.html`, resolved images, chart artefacts, and the reveal.js source tree.

Help

```
node index.js --help
```

For implementation notes, see [CLAUDE.md](CLAUDE.md#L1).
